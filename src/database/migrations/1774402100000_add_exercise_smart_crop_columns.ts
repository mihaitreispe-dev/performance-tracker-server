import { Kysely, sql } from 'kysely';

/**
 * Durable smart-crop (Rekognition body-detect) state on exercises.
 *
 * The spike ran detection in a fire-and-forget in-process poll, which left a
 * row stuck in `assets_pending` with no MediaConvert job if the process
 * restarted mid-analysis. Persisting the Rekognition job id (and the start
 * time, for a timeout fallback) lets a cron drive the analysis phase durably:
 *
 *   assets_pending + rekognition_job_id set + media_convert_job_id null
 *     → analysis phase (cron polls Rekognition, then creates the encode job)
 *   assets_pending + media_convert_job_id set
 *     → encode phase (existing MediaConvert-status cron drives to done)
 *
 * No new status value is introduced — the two phases are distinguished by
 * which job-id column is populated, so the API/UI keep showing "processing".
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE exercises
      ADD COLUMN rekognition_job_id TEXT,
      ADD COLUMN smart_crop_started_at TIMESTAMPTZ
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE exercises
      DROP COLUMN IF EXISTS rekognition_job_id,
      DROP COLUMN IF EXISTS smart_crop_started_at
  `.execute(db);
}
