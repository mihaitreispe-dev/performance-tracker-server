import { Kysely, sql } from 'kysely';

/**
 * Per-user completion log for snacks (content_items with kind='snack').
 *
 * Snacks are short, on-demand movement breaks the athlete plays from
 * the rehabit client; they have no execution / session row of their
 * own (unlike workouts, which carry a workout_executions life-cycle).
 * To surface a "things you've done lately" history that includes both
 * workouts AND snacks, we record one row per play here.
 *
 * Multiple completions of the same snack by the same user are
 * intentionally allowed — re-watching a movement break is a normal
 * pattern and each instance counts as a real engagement event. The
 * client gates emission on the player's "video finished" signal
 * (autoAdvanceOnEnd path) so accidental opens don't insert ghost
 * rows, but the table itself doesn't enforce dedup.
 *
 * Indexes:
 *   - (user_id, completed_at DESC) — the primary query is "show me
 *     this user's most recent plays" for the history view.
 *   - (content_item_id)            — secondary read for "how many
 *     times has THIS snack been completed" analytics.
 *
 * Cascade deletes from both sides: a deleted user leaves no orphan
 * history rows, and a deleted snack drops its completion log too
 * (the rows reference a thing that no longer exists; keeping them
 * would surface dangling history entries with no title to render).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE snack_completions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      duration_seconds INTEGER,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE INDEX snack_completions_user_idx
      ON snack_completions (user_id, completed_at DESC)
  `.execute(db);

  await sql`
    CREATE INDEX snack_completions_item_idx
      ON snack_completions (content_item_id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS snack_completions`.execute(db);
}
