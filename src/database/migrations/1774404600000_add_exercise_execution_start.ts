import { Kysely, sql } from 'kysely';

/**
 * Decouples where an exercise's EXECUTION (demonstration) begins from where its
 * INTRO (explanation) ends, so the two can overlap on the editor's two-track
 * timeline.
 *
 * Until now the boundary was a single point: `intro_end_seconds` doubled as the
 * Skip-intro target AND the implicit start of the demonstration. With
 * `execution_start_seconds` they're independent — the explanation can run past
 * the moment the demonstration starts (overlap), and Skip-intro lands at
 * `execution_start_seconds` so skipping never cuts off the start of the demo.
 *
 * NULL (default) = no override: execution still starts at `intro_end_seconds`
 * (today's behaviour), so existing rows are unchanged. Whole seconds into the
 * main video; >= 0. We don't store the video duration, so the upper bound is
 * validated client-side against the loaded media.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE exercises
      ADD COLUMN execution_start_seconds INTEGER NULL
        CHECK (execution_start_seconds IS NULL OR execution_start_seconds >= 0)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE exercises DROP COLUMN IF EXISTS execution_start_seconds`.execute(db);
}
