import { Kysely, sql } from 'kysely';

/**
 * `outbound_sync_jobs` — queue table for pushing workout completions
 * to external services like Strava, Apple Health, Google Fit (spec D3).
 *
 * Design:
 *  - One row per (workout_execution, provider) pair. Composite UNIQUE
 *    enforces idempotency at the DB level — a double-call to
 *    `enqueueSyncJobs(executionId)` can never create duplicate work,
 *    and a re-completed execution can't double-write to a provider.
 *  - `status` is a small enum (`pending`, `succeeded`, `failed`,
 *    `skipped`). 'skipped' is for "user disconnected this provider
 *    after the job was queued but before the worker picked it up" so
 *    we don't retry forever.
 *  - `attempts` + `last_error` + `next_attempt_at` carry the worker's
 *    retry state. Exponential backoff lives in the worker, not the
 *    schema — the table just stores when to retry next.
 *  - `external_id` is what the provider returned (Strava activity id,
 *    HealthKit object UUID, etc.). Used to power "open this workout
 *    in Strava" deep-links from the completion screen.
 *  - `payload` (jsonb) snapshot of the workout data at enqueue time,
 *    so a slow worker isn't sensitive to mid-flight edits of the
 *    underlying execution / sets.
 *
 * Why a table instead of an in-process job queue:
 *  - Survives server restarts (in-process queues lose pending work
 *    on deploy).
 *  - Multi-instance safe (one row claims via SELECT ... FOR UPDATE
 *    SKIP LOCKED — see the worker for the claim pattern).
 *  - Auditable history of every sync attempt per user — useful for
 *    support and for the user-facing "last sync" UI.
 *
 * Index strategy:
 *  - (user_id, created_at desc) — per-user history view
 *  - (status, next_attempt_at) WHERE status='pending' — the worker's
 *    pick-next query; partial index keeps it tight even as
 *    succeeded rows pile up over time
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE outbound_sync_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workout_execution_id UUID NOT NULL REFERENCES workout_executions(id) ON DELETE CASCADE,
      /* Provider key: 'strava' | 'apple_health' | 'google_fit' | 'garmin' | ... */
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NULL,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      external_id TEXT NULL,
      external_url TEXT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ NULL,
      /* Idempotency: at most one job per (execution, provider). A
         second enqueue against the same pair is a no-op. */
      UNIQUE (workout_execution_id, provider)
    )
  `.execute(db);

  await sql`
    CREATE INDEX outbound_sync_jobs_user_created_idx
      ON outbound_sync_jobs (user_id, created_at DESC)
  `.execute(db);

  await sql`
    CREATE INDEX outbound_sync_jobs_pending_pick_idx
      ON outbound_sync_jobs (next_attempt_at)
      WHERE status = 'pending'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS outbound_sync_jobs_pending_pick_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS outbound_sync_jobs_user_created_idx`.execute(db);
  await sql`DROP TABLE IF EXISTS outbound_sync_jobs`.execute(db);
}
