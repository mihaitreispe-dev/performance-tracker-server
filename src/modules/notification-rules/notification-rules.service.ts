import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';

import {
  ClientType,
  CoachAthleteStatus,
  Database,
  NotificationAudienceFilter,
  NotificationRule,
  OrganisationRole,
} from 'src/database/interfaces';
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

    // Route — read the org once per dispatch (rule.organisation_id),
    // not per-user. uses_external_app determines fcm vs external_app.
    const org = await this.db
      .selectFrom('organisations')
      .where('id', '=', rule.organisation_id)
      .select('uses_external_app')
      .executeTakeFirst();
    const usesExternal = !!org?.uses_external_app;

    if (usesExternal) {
      // No FCM call — just record delivery rows so the integrator can
      // poll them. The integrator's app sees the queued items via the
      // public-API polling endpoint (Phase 7b follow-up).
      const rows = userIds.map((uid) => ({
        rule_id: rule.id,
        user_id: uid,
        organisation_id: rule.organisation_id,
        route: 'external_app' as const,
        ok: true,
        error: null,
      }));
      await this.ruleRepo.recordDeliveriesBatch(rows);
      return { delivered: userIds.length, deduped, failed: 0 };
    }

    // FCM path — for each user, gather tokens, fan-out send.
    let delivered = 0;
    let failed = 0;
    const deliveryRows: Array<{
      rule_id: string;
      user_id: string;
      organisation_id: string;
      route: 'fcm';
      ok: boolean;
      error: string | null;
    }> = [];

    for (const uid of userIds) {
      const user = await this.userRepo.findById(uid);
      const tokens = user?.fcm_tokens ?? [];
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
    await this.ruleRepo.recordDeliveriesBatch(deliveryRows);
    this.logger.log(
      `Rule ${rule.id} (${rule.trigger_type}) fired: delivered=${delivered} deduped=${deduped} failed=${failed}`,
    );
    return { delivered, deduped, failed };
  }

  /** Convenience for org-side "Test send" — fires regardless of dedupe. */
  async testSend(ruleId: string, organisationId: string) {
    const rule = await this.ruleRepo.findByIdInOrg(ruleId, organisationId);
    if (!rule) throw new NotFoundException('Rule not found');
    return this.dispatchOne(rule, { dedupeWindowSeconds: 0 });
  }
}
