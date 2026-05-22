import { Kysely, sql } from 'kysely';

/**
 * Forces every exercise to be a video-first asset and renames the
 * `picture_s3_*` columns to `thumbnail_s3_*` to match what those columns
 * actually hold after the MediaConvert pipeline (an auto-extracted thumbnail,
 * not an arbitrary uploaded image).
 *
 * What this migration does, in order:
 *
 *   1. Rename `exercises.picture_s3_bucket` → `thumbnail_s3_bucket` and
 *      `picture_s3_key` → `thumbnail_s3_key`. No data change — the values
 *      that were already there *are* video thumbnails once status hit
 *      `assets_done`; any "uploaded image" snapshots from the legacy
 *      image-only flow are de facto stale and the next step retires them.
 *
 *   2. For every exercise row that doesn't have a video (legacy image-only
 *      rows): force status = 'draft' so they stop being discoverable on the
 *      public catalogue, and null out the thumbnail columns (it would point
 *      at a manually uploaded picture that no longer matches the schema's
 *      "thumbnail extracted from video" invariant).
 *
 *   3. Add a CHECK constraint: a row may only be in a published status
 *      (anything other than 'draft') if it has a video. Drafts are the only
 *      legal "no video yet" state — the rest of the status machine assumes
 *      the video is present.
 *
 * Rollback restores both the column names and drops the CHECK. It does NOT
 * un-draft the legacy rows the up migration touched — we don't track which
 * rows we changed, and the safer default on rollback is to leave them
 * sleeping rather than re-publish broken content.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('exercises').renameColumn('picture_s3_bucket', 'thumbnail_s3_bucket').execute();
  await db.schema.alterTable('exercises').renameColumn('picture_s3_key', 'thumbnail_s3_key').execute();

  // Retire image-only exercises: not visible publicly any more, and the
  // thumbnail pointer is reset so it'll be re-populated next time the video
  // assets pipeline runs.
  await sql`
    UPDATE exercises
    SET status = 'draft',
        thumbnail_s3_bucket = NULL,
        thumbnail_s3_key = NULL
    WHERE video_s3_bucket IS NULL OR video_s3_key IS NULL
  `.execute(db);

  await sql`
    ALTER TABLE exercises
    ADD CONSTRAINT exercises_video_required_chk
    CHECK (
      status = 'draft'
      OR (video_s3_bucket IS NOT NULL AND video_s3_key IS NOT NULL)
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_video_required_chk`.execute(db);
  await db.schema.alterTable('exercises').renameColumn('thumbnail_s3_bucket', 'picture_s3_bucket').execute();
  await db.schema.alterTable('exercises').renameColumn('thumbnail_s3_key', 'picture_s3_key').execute();
}
