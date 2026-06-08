import { Kysely, sql } from 'kysely';

/**
 * Per-user scheduled snacks (content_items with kind='snack').
 *
 * The calendar is built on workout_schedules; snacks live in a
 * separate content space with no scheduling concept of their own.
 * This table is the snack-side parallel: "I want to do this movement
 * snack on this date." It mirrors workout_schedules' shape so the
 * calendar can merge the two streams by date with minimal special-
 * casing.
 *
 * Distinct from snack_completions: a SCHEDULE is an intent (future
 * or past planned), a COMPLETION is a logged play. A scheduled snack
 * the user actually plays can later get a completion row; we don't
 * auto-link them here (the player's completion path doesn't know
 * which schedule, if any, prompted the play), but `completed_at` on
 * the schedule can be stamped if we wire that up later.
 *
 * Indexes mirror workout_schedules: (user_id, scheduled_date) for the
 * calendar's date-window query, plus content_item_id for cascade
 * lookups. CASCADE on both FKs so deleting a user or a snack leaves
 * no dangling schedule rows.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE snack_schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      scheduled_date DATE NOT NULL,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE INDEX snack_schedules_user_date_idx
      ON snack_schedules (user_id, scheduled_date)
  `.execute(db);

  await sql`
    CREATE INDEX snack_schedules_item_idx
      ON snack_schedules (content_item_id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS snack_schedules`.execute(db);
}
