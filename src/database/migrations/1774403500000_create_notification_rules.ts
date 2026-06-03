import { Kysely, sql } from 'kysely';

/**
 * Push-notification rules authored by org admins.
 *
 * The rules engine (run from a cron + from event listeners on
 * workout-execution finish / schedule miss) iterates active rules,
 * resolves the audience per the audience filter, and delivers via
 * FirebaseService.sendToTokens — to the user's `users.fcm_tokens`
 * if the org's `uses_external_app=false`, or via the rehabit /
 * partner integrator otherwise (the integrator polls the rule's
 * deliveries via a public API endpoint in a follow-up phase).
 *
 * `trigger_type` describes WHEN the rule fires:
 *   - 'recurring'           — interval-driven: `cron_expression` is a
 *                             standard 5-field cron; the engine ticks
 *                             every minute and matches against it.
 *   - 'on_action_completion' — fires when an athlete finishes a
 *                              workout execution (event-driven). The
 *                              `event_filter` JSON narrows further
 *                              (e.g. only after first workout).
 *   - 'on_plan_adherence'   — fires when an athlete misses a
 *                              scheduled workout for N days; the
 *                              `condition_params` JSON carries the
 *                              `windowDays` and `minMissed` values.
 *   - 'on_daily_schedule'    — daily-digest variant of recurring; the
 *                              engine sends at HH:MM local-to-athlete.
 *
 * `audience_filter` selects WHO receives the notification:
 *   { type: 'all_athletes' }                — every athlete in the org
 *   { type: 'general_pop' }                 — athletes with client_type='general'
 *   { type: 'one_to_one' }                  — athletes with client_type='athlete'
 *   { type: 'specific', userIds: [...] }    — explicit list
 *   { type: 'coach', coachId: '...' }       — athletes coached by X
 *
 * `delivery_route` is computed when the rule fires (not stored as
 * a column) by reading the org's uses_external_app flag — the rule
 * itself doesn't pin a delivery route.
 *
 * No materialised "next_fire_at" — the engine evaluates the cron
 * expression on each tick. Adding one would let us index for cheap
 * upcoming-rule selection, deferred until traffic warrants it.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE notification_rules (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      created_by_user_id UUID NOT NULL REFERENCES users(id),
      name            TEXT NOT NULL,
      enabled         BOOLEAN NOT NULL DEFAULT TRUE,
      trigger_type    TEXT NOT NULL,
      cron_expression TEXT NULL,
      event_filter    JSONB NOT NULL DEFAULT '{}'::jsonb,
      condition_params JSONB NOT NULL DEFAULT '{}'::jsonb,
      audience_filter JSONB NOT NULL,
      title           TEXT NOT NULL,
      body            TEXT NOT NULL,
      click_action    TEXT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT notification_rules_trigger_chk CHECK (
        trigger_type IN ('recurring', 'on_action_completion', 'on_plan_adherence', 'on_daily_schedule')
      ),

      CONSTRAINT notification_rules_cron_required CHECK (
        trigger_type NOT IN ('recurring', 'on_daily_schedule')
        OR cron_expression IS NOT NULL
      )
    )
  `.execute(db);

  await sql`
    CREATE INDEX notification_rules_org_idx ON notification_rules (organisation_id)
  `.execute(db);

  await sql`
    CREATE INDEX notification_rules_active_trigger_idx
      ON notification_rules (trigger_type)
      WHERE enabled = TRUE
  `.execute(db);

  /*
   * Append-only delivery log. One row per (rule_id, user_id, sent_at)
   * tuple. Used to:
   *   - dedupe: don't re-send a recurring rule to the same user inside
   *     its cron window (engine checks the most-recent row).
   *   - audit: show admins "who got this and when".
   *
   * Retention: deferred. A nightly cron could prune > 90 days in a
   * follow-up; today the table grows linearly with sends.
   */
  await sql`
    CREATE TABLE notification_rule_deliveries (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rule_id         UUID NOT NULL REFERENCES notification_rules(id) ON DELETE CASCADE,
      user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      route           TEXT NOT NULL,
      ok              BOOLEAN NOT NULL,
      error           TEXT NULL,

      CONSTRAINT notification_deliveries_route_chk CHECK (
        route IN ('fcm', 'external_app')
      )
    )
  `.execute(db);

  await sql`
    CREATE INDEX notification_deliveries_dedupe_idx
      ON notification_rule_deliveries (rule_id, user_id, sent_at DESC)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS notification_rule_deliveries`.execute(db);
  await sql`DROP TABLE IF EXISTS notification_rules`.execute(db);
}
