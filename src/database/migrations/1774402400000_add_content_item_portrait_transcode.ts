import { Kysely, sql } from 'kysely';

/**
 * Per-snack 9:16 portrait companion + a local-transcode pending flag.
 *
 * Snacks upload a single source mp4 (the coach's raw landscape shoot in
 * almost every case). Phone-portrait viewers used to get a "rotate your
 * phone" nudge because no 9:16 cut existed; this migration adds the
 * columns needed for the local-transcode pipeline to produce one
 * automatically alongside the original.
 *
 *   - video_portrait_s3_bucket / _key: where the 9:16 mp4 lands once
 *     transcode finishes. Null until the cron flips it.
 *   - transcode_pending + transcode_started_at: same durable-claim
 *     pattern the exercises pipeline uses — the API flips pending=true
 *     in markUploadComplete, the cron claims (stamps started_at) and
 *     drives one ffmpeg run to completion. A process restart mid-job
 *     is re-claimed after the 10-minute timeout.
 *
 * Status column is unchanged. The row stays at READY immediately after
 * the source upload (the landscape clip is the primary playable
 * surface); the portrait cut lands later as a best-effort enhancement.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE content_items
      ADD COLUMN video_portrait_s3_bucket VARCHAR(255),
      ADD COLUMN video_portrait_s3_key    VARCHAR(500),
      ADD COLUMN transcode_pending        BOOLEAN     NOT NULL DEFAULT FALSE,
      ADD COLUMN transcode_started_at     TIMESTAMPTZ
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE content_items
      DROP COLUMN IF EXISTS video_portrait_s3_bucket,
      DROP COLUMN IF EXISTS video_portrait_s3_key,
      DROP COLUMN IF EXISTS transcode_pending,
      DROP COLUMN IF EXISTS transcode_started_at
  `.execute(db);
}
