import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';

import {
  Database,
  NewNotificationRule,
  NewNotificationRuleDelivery,
  NotificationRule,
  NotificationRuleDelivery,
  NotificationRuleTriggerType,
  NotificationRuleUpdate,
} from 'src/database/interfaces';

/**
 * Repo for notification_rules + notification_rule_deliveries.
 *
 * The dispatcher reaches in via listEnabledByTrigger() each tick, the
 * org-side admin UI uses the CRUD methods, and the dedupe path uses
 * findLatestDelivery to avoid re-firing inside the same cron window.
 */
@Injectable()
export class NotificationRuleRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  // -------- Rule CRUD --------

  async create(input: NewNotificationRule): Promise<NotificationRule> {
    return this.db
      .insertInto('notification_rules')
      .values(input)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findById(id: string): Promise<NotificationRule | undefined> {
    return this.db
      .selectFrom('notification_rules')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();
  }

  async findByIdInOrg(id: string, organisationId: string): Promise<NotificationRule | undefined> {
    return this.db
      .selectFrom('notification_rules')
      .where('id', '=', id)
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .executeTakeFirst();
  }

  async listByOrg(organisationId: string): Promise<NotificationRule[]> {
    return this.db
      .selectFrom('notification_rules')
      .where('organisation_id', '=', organisationId)
      .orderBy('created_at', 'desc')
      .selectAll()
      .execute();
  }

  /**
   * Engine entry — only enabled rules of the requested trigger types.
   * The dispatcher passes the cron-tick subset; the event-listener
   * paths pass the event subset. Returns all matching rows across all
   * orgs in one call so the engine can fan out per-org delivery
   * routing efficiently.
   */
  async listEnabledByTrigger(triggers: NotificationRuleTriggerType[]): Promise<NotificationRule[]> {
    if (triggers.length === 0) return [];
    return this.db
      .selectFrom('notification_rules')
      .where('enabled', '=', true)
      .where('trigger_type', 'in', triggers)
      .selectAll()
      .execute();
  }

  async update(id: string, patch: NotificationRuleUpdate): Promise<NotificationRule> {
    // sql`NOW()` is needed because the Generated<Timestamp> column type
    // refuses a plain Date in the .set() signature even though it
    // round-trips fine at runtime. Server-side NOW() also keeps the
    // updated_at exactly synced with other table writes.
    return this.db
      .updateTable('notification_rules')
      .set({ ...patch, updated_at: sql`NOW()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('notification_rules').where('id', '=', id).execute();
  }

  // -------- Delivery log --------

  async recordDelivery(input: NewNotificationRuleDelivery): Promise<NotificationRuleDelivery> {
    return this.db
      .insertInto('notification_rule_deliveries')
      .values(input)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async recordDeliveriesBatch(rows: NewNotificationRuleDelivery[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insertInto('notification_rule_deliveries').values(rows).execute();
  }

  /**
   * Returns the most recent delivery row for a (rule, user) pair —
   * used by the dedupe path to skip re-firing the same rule to the
   * same user inside the cron window.
   */
  async findLatestDelivery(
    ruleId: string,
    userId: string,
  ): Promise<NotificationRuleDelivery | undefined> {
    return this.db
      .selectFrom('notification_rule_deliveries')
      .where('rule_id', '=', ruleId)
      .where('user_id', '=', userId)
      .orderBy('sent_at', 'desc')
      .limit(1)
      .selectAll()
      .executeTakeFirst();
  }

  /**
   * For a rule, count deliveries inside a [from, now] window. Used by
   * the engine to "did we already send X to user Y in this window?"
   * Cheaper than fetching all rows when we only need the boolean.
   */
  async hasDeliveryAfter(ruleId: string, userId: string, after: Date): Promise<boolean> {
    // The sent_at column is Generated<Timestamp> which Kysely's strict
    // expression-builder won't accept a plain Date for. Inline raw SQL
    // for the comparison; rest of the query stays type-safe.
    const r = await this.db
      .selectFrom('notification_rule_deliveries')
      .where('rule_id', '=', ruleId)
      .where('user_id', '=', userId)
      .where(sql<boolean>`sent_at >= ${after.toISOString()}::timestamptz`)
      .select('id')
      .limit(1)
      .executeTakeFirst();
    return !!r;
  }

  /**
   * Audit log for a single rule, newest first. Joins users so the UI
   * doesn't have to make a second hop just to render a recipient name —
   * the delivery table only knows user ids, but the org admin reading
   * the log wants "Sarah at 09:02" not "f1a3…b9 at 09:02".
   *
   * `limit` is capped at 200 server-side as a courtesy to the DOM;
   * the engine writes one row per (rule, user) per fire, so a daily
   * rule against 100 users hits 200 after two days.
   */
  async listDeliveriesForRule(
    ruleId: string,
    organisationId: string,
    limit = 50,
  ): Promise<
    Array<NotificationRuleDelivery & { userDisplayName: string; userEmail: string }>
  > {
    const capped = Math.max(1, Math.min(limit, 200));
    const rows = await this.db
      .selectFrom('notification_rule_deliveries as d')
      .innerJoin('users as u', 'u.id', 'd.user_id')
      .where('d.rule_id', '=', ruleId)
      .where('d.organisation_id', '=', organisationId)
      .orderBy('d.sent_at', 'desc')
      .limit(capped)
      .select([
        'd.id',
        'd.rule_id',
        'd.user_id',
        'd.organisation_id',
        'd.sent_at',
        'd.route',
        'd.ok',
        'd.error',
        'u.display_name as userDisplayName',
        'u.email as userEmail',
      ])
      .execute();
    return rows;
  }

  /**
   * For the integrator-poll endpoint (Phase 7b): list deliveries with
   * route='external_app' since a watermark, for a single user.
   */
  async listExternalDeliveriesForUser(
    userId: string,
    organisationId: string,
    afterIso: string | null,
  ): Promise<NotificationRuleDelivery[]> {
    let q = this.db
      .selectFrom('notification_rule_deliveries')
      .where('user_id', '=', userId)
      .where('organisation_id', '=', organisationId)
      .where('route', '=', 'external_app');
    if (afterIso) {
      // Same Date-vs-Generated<Timestamp> issue as hasDeliveryAfter;
      // inline raw SQL for the timestamp comparison.
      q = q.where(sql<boolean>`sent_at > ${afterIso}::timestamptz`);
    }
    return q.orderBy('sent_at', 'asc').selectAll().execute();
  }
}
