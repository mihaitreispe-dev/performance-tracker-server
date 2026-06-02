import { Kysely, sql } from 'kysely';

/**
 * `player_qoe_events` — append-only telemetry table for the workout
 * player (spec F2).
 *
 * Hosts three kinds of signal:
 *  - QoE (streaming health): startup time, rebuffer count + duration,
 *    fatal errors, bitrate distribution
 *  - Funnel: preview → start → block_complete → session_complete
 *    drop-offs
 *  - Logging friction: time-in-LOGGING, edits-after-confirm,
 *    scroll vs type usage
 *
 * Schema choices:
 *  - `event_type` (text) — string namespace like 'player.startup',
 *    'workout.block_complete'. Strings (not enum) keep us free to add
 *    new event kinds without a migration each time.
 *  - `metric` (jsonb) — open shape per event_type. Standard fields by
 *    convention: { ms, count, label, exerciseId, segmentId, bitrate,
 *    levelHeight, error, ... }. Documented in the client emitter file,
 *    not at the schema level — flexibility wins here.
 *  - `user_id` nullable — anonymous events (e.g. cast attempts before
 *    auth) shouldn't be blocked. Most rows carry a user_id; we just
 *    don't enforce.
 *  - `organisation_id` nullable — same reasoning; org-scoping is a
 *    nice-to-have for per-tenant QoE rollups, not a hard requirement.
 *  - `created_at` is the only timestamp; events are append-only and
 *    never updated.
 *
 * Index strategy:
 *  - (event_type, created_at desc): the canonical query "show me the
 *    last N rebuffer events" or "p95 startup time over the last hour".
 *  - (user_id, created_at desc) WHERE user_id IS NOT NULL: per-user
 *    funnel reconstruction without scanning anon rows.
 *
 * No FK constraints on user_id / organisation_id — telemetry must
 * survive its referenced row being deleted, and we don't cascade-delete
 * QoE history when a user does (it's aggregate signal).
 *
 * Retention is intentionally not enforced here. A future cleanup
 * cron can age out rows past N days; v1 just accumulates.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE player_qoe_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NULL,
      organisation_id UUID NULL,
      event_type TEXT NOT NULL,
      metric JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);
  await sql`
    CREATE INDEX player_qoe_events_type_created_idx
      ON player_qoe_events (event_type, created_at DESC)
  `.execute(db);
  await sql`
    CREATE INDEX player_qoe_events_user_created_idx
      ON player_qoe_events (user_id, created_at DESC)
      WHERE user_id IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS player_qoe_events_user_created_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS player_qoe_events_type_created_idx`.execute(db);
  await sql`DROP TABLE IF EXISTS player_qoe_events`.execute(db);
}
