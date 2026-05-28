import { Kysely, sql } from 'kysely';

/**
 * Durable local-transcode state on exercises (parity with smart-crop).
 *
 * The fire-and-forget LocalTranscodeService left a row stuck in
 * assets_pending if the dev process restarted mid-ffmpeg. Persisting a
 * "pending" flag + a claim timestamp lets a cron drive the local transcode
 * the same way it drives MediaConvert / Rekognition:
 *
 *   assets_pending + local_transcode_pending=true
 *     → local transcode phase (cron claims, runs ffmpeg, sets assets_done)
 *
 * Claim is at-most-once-ish within a 10-minute window via
 * local_transcode_started_at — if the process dies, the next tick after the
 * timeout re-claims and retries.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE exercises
      ADD COLUMN local_transcode_pending BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN local_transcode_started_at TIMESTAMPTZ
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE exercises
      DROP COLUMN IF EXISTS local_transcode_pending,
      DROP COLUMN IF EXISTS local_transcode_started_at
  `.execute(db);
}
