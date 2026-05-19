import { Kysely } from 'kysely';

/**
 * Adds in-video intro markers (intro_start_seconds / intro_end_seconds) so the workout
 * player can offer a "Skip intro" affordance within a single exercise demo video, and
 * stores the Vimeo source video id for exercises imported from Vimeo.
 *
 * Both intros remain supported:
 *  - exercises.intro_content_item_id: optional separate explainer video (existing).
 *  - exercises.intro_start_seconds + intro_end_seconds: inline markers on the main video.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('exercises')
    .addColumn('intro_start_seconds', 'integer')
    .addColumn('intro_end_seconds', 'integer')
    .addColumn('vimeo_video_id', 'varchar(64)')
    .execute();

  // Inline timestamps on content_items too — useful when a `course_lesson` or a
  // standalone `snack` has a few seconds of intro/explainer at the head that
  // returning users want to skip on subsequent plays.
  await db.schema
    .alterTable('content_items')
    .addColumn('intro_start_seconds', 'integer')
    .addColumn('intro_end_seconds', 'integer')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('content_items').dropColumn('intro_end_seconds').dropColumn('intro_start_seconds').execute();
  await db.schema
    .alterTable('exercises')
    .dropColumn('vimeo_video_id')
    .dropColumn('intro_end_seconds')
    .dropColumn('intro_start_seconds')
    .execute();
}
