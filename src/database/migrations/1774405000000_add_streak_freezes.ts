import { Kysely, sql } from 'kysely';

/**
 * Phase 2 — streak-freeze items. A scarce, earned protection layered on top of
 * the Phase-1 auto-grace: freezes are granted on level-up milestones and
 * auto-consumed to save a streak when grace can't (gentle / rehab-safe — no
 * "forgot to freeze" guilt). One counter on the progression row.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE user_progression ADD COLUMN streak_freezes INTEGER NOT NULL DEFAULT 0`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE user_progression DROP COLUMN IF EXISTS streak_freezes`.execute(db);
}
