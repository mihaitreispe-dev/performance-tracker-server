import { Kysely, sql } from 'kysely';

/**
 * `leaderboard_opt_in` on `user_settings` (spec E5 / D-03).
 *
 * Defaults FALSE to honour the spec's opt-out posture — every social
 * surface the player ever shows must be off by default for our
 * solo-lifter audience. Users who want a leaderboard / cohort /
 * streak surface tick this toggle from settings.
 *
 * No index — this is a sparse boolean read only when a leaderboard
 * surface is about to render; nothing filters on it at scale.
 *
 * The actual leaderboard UI doesn't ship in this migration — gated
 * behind a per-org feature flag and a "we have signal that this lifts
 * retention" decision. The schema lands first so the toggle works
 * (and so a future leaderboard query has a way to scope opt-in
 * users) without us re-doing this migration later.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE user_settings
      ADD COLUMN leaderboard_opt_in BOOLEAN NOT NULL DEFAULT FALSE
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE user_settings DROP COLUMN IF EXISTS leaderboard_opt_in`.execute(db);
}
