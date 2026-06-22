import { Kysely, sql } from 'kysely';

/**
 * Drops the two columns left orphaned by the exercise model rework:
 *   - `exercises.category` — the legacy free-text category, superseded by the
 *     m2m `exercise_categories` join (its index drops with the column).
 *   - `exercises.voiceover_script` — only ever read by the retired
 *     generated_from_cues voiceover mode.
 *
 * No data migration: `category` values weren't surfaced anywhere after the
 * rework, and voiceover_script only fed the removed mode.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE exercises DROP COLUMN IF EXISTS category`.execute(db);
  await sql`ALTER TABLE exercises DROP COLUMN IF EXISTS voiceover_script`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE exercises ADD COLUMN IF NOT EXISTS category varchar(100)`.execute(db);
  await sql`ALTER TABLE exercises ADD COLUMN IF NOT EXISTS voiceover_script TEXT`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises (category)`.execute(db);
}
