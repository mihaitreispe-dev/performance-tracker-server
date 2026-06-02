import { Kysely, sql } from 'kysely';

/**
 * `partial` flag on workout_executions (spec B7).
 *
 * A workout execution completes "partially" when the user ends it
 * early, skips an exercise, or otherwise finishes before working
 * through the prescribed program. The spec wants this to be visible
 * in:
 *   - the completion summary (a "Partial workout" chip)
 *   - the history list (so the user / coach can spot which sessions
 *     were truncated)
 *   - server analytics (training stress derived from a partial
 *     session shouldn't be reported as if the full session ran)
 *
 * Default false — preserves the meaning of every existing row, which
 * we know nothing more specific about. The client only sets this to
 * true on the explicit "End early" / "Skip exercise" code paths;
 * unmodified `completedAt` writes leave it false.
 *
 * No index — this is a sparse flag (most rows stay false) used as
 * a display annotation, not a filter primary on its own. Composite
 * filters can index on the existing started_at + this column if a
 * "show me partial sessions in the last 30 days" query emerges
 * later.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE workout_executions
      ADD COLUMN partial BOOLEAN NOT NULL DEFAULT false
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE workout_executions DROP COLUMN IF EXISTS partial`.execute(db);
}
