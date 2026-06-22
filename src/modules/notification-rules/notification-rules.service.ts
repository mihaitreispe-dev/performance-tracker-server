import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';

import {
  ClientType,
  CoachAthleteStatus,
  Database,
  NewNotificationRuleDelivery,
  NotificationAudienceFilter,
  NotificationChannel,
  NotificationRule,
  OrganisationRole,
} from 'src/database/interfaces';
import { EmailService } from 'src/modules/email/email.service';
import { FirebaseService } from 'src/modules/firebase/firebase.service';
import { NotificationRuleRepository } from 'src/repositories/notification-rule.repository';
import { UserRepository } from 'src/repositories/user.repository';

/**
 * Engine that walks the notification_rules table, resolves the
 * audience, decides delivery route per org, and dispatches via
 * FirebaseService or records an external-app delivery row for the
 * integrator to poll.
 *
 * Driven by:
 *   - NotificationRulesCronService — minute tick for recurring +
 *     daily-schedule triggers.
 *   - Direct dispatchOne() — used by the org-side "test send" button
 *     and (Phase 7b) by event listeners on workout-execution finish
 *     for trigger='on_action_completion'.
 *
 * Dedupe model: for cron-driven rules we use a window of (now - 50s,
 * now]; if a rule already delivered to a user inside that window we
 * skip it. Keeps re-runs of the cron tick idempotent without storing
 * a per-rule "last_fired_at" column.
 */
@Injectable()
export class NotificationRulesService {
  private readonly logger = new Logger(NotificationRulesService.name);

  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly ruleRepo: NotificationRuleRepository,
    private readonly userRepo: UserRepository,
    private readonly firebase: FirebaseService,
    private readonly email: EmailService,
  ) {}

  // --------------------------------------------------------------------------
  // Audience resolution
  // --------------------------------------------------------------------------

  /**
   * Resolve an audience filter to a set of user ids inside an org.
   * Lives here rather than in a separate "AudienceResolver" because
   * every code path that fires a rule has to call it; keeping the
   * lookup co-located with the dispatcher avoids a layer of indirection
   * for a single-table query.
   */
  async resolveAudience(
    organisationId: string,
    filter: NotificationAudienceFilter,
  ): Promise<string[]> {
    switch (filter.type) {
      case 'all_athletes': {
        const rows = await this.db
          .selectFrom('organisation_memberships')
          .where('organisation_id', '=', organisationId)
          .where('role', '=', OrganisationRole.ATHLETE)
          .where('accepted_at', 'is not', null)
          .select('user_id')
          .execute();
        return rows.map((r) => r.user_id);
      }

      case 'general_pop':
      case 'one_to_one': {
        const ct = filter.type === 'general_pop' ? ClientType.GENERAL : ClientType.ATHLETE;
        const rows = await this.db
          .selectFrom('organisation_memberships')
          .where('organisation_id', '=', organisationId)
          .where('role', '=', OrganisationRole.ATHLETE)
          .where('client_type', '=', ct)
          .where('accepted_at', 'is not', null)
          .select('user_id')
          .execute();
        return rows.map((r) => r.user_id);
      }

      case 'specific': {
        // Trust the caller's ids but tenant-scope: drop any id whose
        // membership doesn't belong to the org. Defense in depth — the
        // authoring UI shouldn't let cross-org ids be persisted, but
        // an old rule whose user later left would otherwise leak.
        if (filter.userIds.length === 0) return [];
        const rows = await this.db
          .selectFrom('organisation_memberships')
          .where('organisation_id', '=', organisationId)
          .where('user_id', 'in', filter.userIds)
          .where('role', '=', OrganisationRole.ATHLETE)
          .where('accepted_at', 'is not', null)
          .select('user_id')
          .execute();
        return rows.map((r) => r.user_id);
      }

      case 'coach': {
        // All ATHLETE memberships coached by `coachId` in this org.
        // Table columns are coach_id / athlete_id (not user-suffixed)
        // and the relationship row is itself tenant-scoped via
        // organisation_id, so we filter there directly instead of via
        // the membership join.
        const rows = await this.db
          .selectFrom('coach_athlete_relationships')
          .where('organisation_id', '=', organisationId)
          .where('coach_id', '=', filter.coachId)
          .where('status', '=', CoachAthleteStatus.ACTIVE)
          .select('athlete_id')
          .execute();
        return rows.map((r) => r.athlete_id);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Dispatch
  // --------------------------------------------------------------------------

  /**
   * Fire a single rule end-to-end: resolve audience, route per org,
   * deliver via FCM or queue as external-app delivery.
   *
   * Dedupe: if `dedupeWindowSeconds` is set, skip users that already
   * received this rule inside the window. The cron driver passes 50s
   * to make consecutive minute-ticks idempotent; ad-hoc test sends
   * pass 0 to always deliver.
   */
  async dispatchOne(
    rule: NotificationRule,
    opts: { dedupeWindowSeconds: number } = { dedupeWindowSeconds: 50 },
  ): Promise<{ delivered: number; deduped: number; failed: number }> {
    const filter = rule.audience_filter as NotificationAudienceFilter;
    let userIds = await this.resolveAudience(rule.organisation_id, filter);

    // Dedupe pass — drop users that already received in window.
    let deduped = 0;
    if (opts.dedupeWindowSeconds > 0 && userIds.length > 0) {
      const after = new Date(Date.now() - opts.dedupeWindowSeconds * 1000);
      const fresh: string[] = [];
      for (const uid of userIds) {
        const recent = await this.ruleRepo.hasDeliveryAfter(rule.id, uid, after);
        if (recent) deduped += 1;
        else fresh.push(uid);
      }
      userIds = fresh;
    }
    if (userIds.length === 0) {
      return { delivered: 0, deduped, failed: 0 };
    }

    // Fetch the recipient rows once (id, email, fcm tokens) — shared by both
    // channels so we avoid an N+1 over the audience.
    const recipients = await this.db
      .selectFrom('users')
      .where('id', 'in', userIds)
      .select(['id', 'email', 'fcm_tokens'])
      .execute();
    const byId = new Map(recipients.map((r) => [r.id, r]));

    // A rule fires on one or both channels. channels has a DB default of
    // ['push'], so older rules keep their push-only behaviour.
    const channels: NotificationChannel[] = rule.channels?.length
      ? (rule.channels as NotificationChannel[])
      : ['push'];

    let delivered = 0;
    let failed = 0;
    const deliveryRows: NewNotificationRuleDelivery[] = [];

    // ---- PUSH channel --------------------------------------------------------
    if (channels.includes('push')) {
      // Route — read the org once per dispatch. uses_external_app determines
      // fcm (first-party app, incl. ReHabit once it registers tokens) vs
      // external_app (third-party integrator polls the delivery rows).
      const org = await this.db
        .selectFrom('organisations')
        .where('id', '=', rule.organisation_id)
        .select('uses_external_app')
        .executeTakeFirst();
      const usesExternal = !!org?.uses_external_app;

      if (usesExternal) {
        for (const uid of userIds) {
          deliveryRows.push({
            rule_id: rule.id,
            user_id: uid,
            organisation_id: rule.organisation_id,
            route: 'external_app',
            ok: true,
            error: null,
          });
          delivered += 1;
        }
      } else {
        for (const uid of userIds) {
          const tokens = byId.get(uid)?.fcm_tokens ?? [];
          if (tokens.length === 0) {
            deliveryRows.push({
              rule_id: rule.id,
              user_id: uid,
              organisation_id: rule.organisation_id,
              route: 'fcm',
              ok: false,
              error: 'no device tokens',
            });
            failed += 1;
            continue;
          }
          const results = await this.firebase.sendToTokens({
            tokens,
            title: rule.title,
            body: rule.body,
            clickAction: rule.click_action ?? undefined,
            data: { ruleId: rule.id },
          });
          const anyOk = results.some((r) => r.ok);
          // Prune invalid tokens fire-and-forget. Don't block the send.
          for (const r of results) {
            if (r.invalidToken) {
              void this.userRepo.removeFcmToken(uid, r.token).catch(() => undefined);
            }
          }
          if (anyOk) delivered += 1;
          else failed += 1;
          deliveryRows.push({
            rule_id: rule.id,
            user_id: uid,
            organisation_id: rule.organisation_id,
            route: 'fcm',
            ok: anyOk,
            error: anyOk ? null : (results.find((r) => !r.ok)?.error ?? 'all sends failed'),
          });
        }
      }
    }

    // ---- EMAIL channel -------------------------------------------------------
    // App-independent: SendGrid sends to users.email regardless of the org's
    // push routing, so it reaches ReHabit and Step Zero users alike.
    if (channels.includes('email')) {
      const subject = rule.email_subject ?? rule.title;
      const html = rule.email_body ?? rule.body;
      const targets = userIds
        .map((uid) => ({ uid, email: byId.get(uid)?.email }))
        .filter((t): t is { uid: string; email: string } => !!t.email);

      if (targets.length > 0) {
        const results = await this.email.sendToEmails({
          to: targets.map((t) => t.email),
          subject,
          html,
        });
        // results align with targets by input order.
        results.forEach((res, i) => {
          const t = targets[i];
          if (res.ok) delivered += 1;
          else failed += 1;
          deliveryRows.push({
            rule_id: rule.id,
            user_id: t.uid,
            organisation_id: rule.organisation_id,
            route: 'email',
            ok: res.ok,
            error: res.ok ? null : (res.error ?? 'email send failed'),
          });
        });
      }
    }

    await this.ruleRepo.recordDeliveriesBatch(deliveryRows);
    this.logger.log(
      `Rule ${rule.id} (${rule.trigger_type}) fired [${channels.join('+')}]: ` +
        `delivered=${delivered} deduped=${deduped} failed=${failed}`,
    );
    return { delivered, deduped, failed };
  }

  /** Convenience for org-side "Test send" — fires regardless of dedupe. */
  async testSend(ruleId: string, organisationId: string) {
    const rule = await this.ruleRepo.findByIdInOrg(ruleId, organisationId);
    if (!rule) throw new NotFoundException('Rule not found');
    return this.dispatchOne(rule, { dedupeWindowSeconds: 0 });
  }

  // --------------------------------------------------------------------------
  // Event-driven entrypoints — called by feature modules (workout-execution
  // finish, plan-adherence cron) instead of the time-based driver.
  // --------------------------------------------------------------------------

  /**
   * An athlete completed a workout. Find every enabled rule with
   * trigger=on_action_completion across every org the athlete is a
   * member of, check the event-filter matches, and fire those whose
   * audience filter would include this user.
   *
   * Filter semantics for action-completion rules: the audience filter
   * is "who is eligible" — the dispatched delivery still goes to ONLY
   * the user who triggered the event (not the whole audience). This
   * matches the natural UX ("nice work, you finished a workout!")
   * vs "everyone gets notified when anyone finishes" which is what a
   * naive read of audience_filter would give.
   *
   * eventFilter shape on the rule: `{ eventType?: 'workout_finished' }`.
   * Empty filter matches all events of any type.
   */
  async fireOnActionCompletion(input: {
    userId: string;
    eventType: 'workout_finished';
  }): Promise<void> {
    // Find every org the user is an accepted athlete in. Action-
    // completion rules per-org need to be considered independently.
    const memberships = await this.db
      .selectFrom('organisation_memberships')
      .where('user_id', '=', input.userId)
      .where('role', '=', OrganisationRole.ATHLETE)
      .where('accepted_at', 'is not', null)
      .select(['organisation_id', 'client_type'])
      .execute();
    if (memberships.length === 0) return;

    const rules = await this.ruleRepo.listEnabledByTrigger([
      // Cast widens the engine's trigger enum without introducing a
      // separate per-method overload — listEnabledByTrigger filters
      // by trigger_type IN (...) which already handles unknown values
      // by simply matching nothing.
      'on_action_completion' as unknown as Parameters<
        typeof this.ruleRepo.listEnabledByTrigger
      >[0][number],
    ]);

    for (const m of memberships) {
      const orgRules = rules.filter((r) => r.organisation_id === m.organisation_id);
      for (const rule of orgRules) {
        // event-filter match
        const filter = rule.event_filter as { eventType?: string };
        if (filter.eventType && filter.eventType !== input.eventType) continue;

        // audience eligibility — re-use resolveAudience but check
        // membership rather than dispatching to the whole list.
        const audience = rule.audience_filter as NotificationAudienceFilter;
        if (!this.userMatchesAudience(audience, input.userId, m.client_type)) continue;

        // Fire — but scope dispatch to the single user instead of
        // resolveAudience-then-multicast. Reuse dispatchOne by
        // synthesizing a one-off rule with type=specific.
        const oneOffRule = { ...rule, audience_filter: { type: 'specific', userIds: [input.userId] } as NotificationAudienceFilter };
        await this.dispatchOne(oneOffRule);
      }
    }
  }

  /**
   * Engine-side eligibility check: would `userId` (with this client
   * type) fall inside `audience`? Cheaper than re-running
   * resolveAudience just to ask "is X in the resulting set?" — we
   * already know the user and just need to test the predicate.
   */
  private userMatchesAudience(
    audience: NotificationAudienceFilter,
    userId: string,
    clientType: string | null,
  ): boolean {
    switch (audience.type) {
      case 'all_athletes':
        return true;
      case 'general_pop':
        return clientType === ClientType.GENERAL;
      case 'one_to_one':
        return clientType === ClientType.ATHLETE;
      case 'specific':
        return audience.userIds.includes(userId);
      case 'coach':
        // Would need a relationship lookup; keep simple — defer the
        // coach-audience eligibility check until the plan-adherence
        // path exercises it. For action-completion rules, audience
        // 'coach' is unusual (you'd typically pick by client_type).
        return false;
    }
  }

  /**
   * Plan-adherence sweep. Called once per day by the cron. For each
   * enabled rule with trigger=on_plan_adherence, walks the rule's
   * audience and finds members who have scheduled workouts in the
   * lookback window with no completion. Fires the rule for each such
   * athlete individually (same per-user dispatch as
   * fireOnActionCompletion).
   *
   * Lookback window comes from rule.condition_params:
   *   { windowDays: 7, minMissed: 2 }  // missed ≥2 in the last 7 days
   * Defaults: windowDays=7, minMissed=1.
   *
   * Dedupe: the engine's per-user delivery log naturally keeps the
   * rule from re-firing inside the standard window. For plan-adherence
   * we pass a bigger dedupe window (24h) so an athlete isn't pinged
   * twice the same day if the cron runs at the wrong time.
   */
  async runPlanAdherenceSweep(): Promise<{ fired: number }> {
    const rules = await this.ruleRepo.listEnabledByTrigger([
      'on_plan_adherence' as unknown as Parameters<
        typeof this.ruleRepo.listEnabledByTrigger
      >[0][number],
    ]);
    if (rules.length === 0) return { fired: 0 };

    let fired = 0;
    for (const rule of rules) {
      const params = rule.condition_params as { windowDays?: number; minMissed?: number };
      const windowDays = Math.max(1, params.windowDays ?? 7);
      const minMissed = Math.max(1, params.minMissed ?? 1);

      const audience = await this.resolveAudience(rule.organisation_id, rule.audience_filter as NotificationAudienceFilter);
      if (audience.length === 0) continue;

      // For each candidate, count missed scheduled workouts inside the
      // lookback window. Missed = scheduled_date in window AND no
      // workout_execution linked (workout_schedule_id) with completed_at.
      const after = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
      const afterIso = after.toISOString();

      for (const userId of audience) {
        const missedRow = await this.db
          .selectFrom('workout_schedules as s')
          .leftJoin('workout_executions as e', (j) =>
            j.onRef('e.workout_schedule_id', '=', 's.id').on('e.completed_at', 'is not', null),
          )
          .where('s.user_id', '=', userId)
          .where(sql<boolean>`s.scheduled_date >= ${afterIso}::date`)
          .where(sql<boolean>`s.scheduled_date < NOW()::date`)
          .where('e.id', 'is', null)
          .select(sql<number>`count(s.id)::int`.as('missed'))
          .executeTakeFirst();

        const missed = missedRow?.missed ?? 0;
        if (missed < minMissed) continue;

        // Synthesize a one-off rule scoped to this user (same trick
        // as fireOnActionCompletion). 24h dedupe so this rule
        // doesn't double-fire if the sweep ticks twice a day.
        const oneOff = {
          ...rule,
          audience_filter: { type: 'specific', userIds: [userId] } as NotificationAudienceFilter,
        };
        const result = await this.dispatchOne(oneOff, { dedupeWindowSeconds: 24 * 60 * 60 });
        if (result.delivered > 0) fired += 1;
      }
    }
    return { fired };
  }
}
