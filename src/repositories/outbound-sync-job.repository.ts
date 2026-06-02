import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  NewOutboundSyncJob,
  OutboundSyncJob,
  OutboundSyncJobUpdate,
} from 'src/database/interfaces';

/**
 * Persists outbound-sync queue rows. See the 1774403000000 migration
 * for the full design (idempotency, retry semantics, multi-instance
 * claim).
 */
@Injectable()
export class OutboundSyncJobRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  /**
   * Idempotent enqueue. The (workout_execution_id, provider) unique
   * constraint guarantees at most one row per pair; we use
   * ON CONFLICT DO NOTHING so a double-call from finishWorkout
   * (e.g. two devices racing) doesn't error.
   *
   * Returns the existing row when a conflict is observed so the
   * caller can read the canonical state without an extra read.
   */
  async enqueue(data: NewOutboundSyncJob): Promise<OutboundSyncJob> {
    const inserted = await this.db
      .insertInto('outbound_sync_jobs')
      .values(data)
      .onConflict((oc) => oc.columns(['workout_execution_id', 'provider']).doNothing())
      .returningAll()
      .executeTakeFirst();
    if (inserted) return inserted;
    // Conflict — return the existing row.
    return this.db
      .selectFrom('outbound_sync_jobs')
      .selectAll()
      .where('workout_execution_id', '=', data.workout_execution_id!)
      .where('provider', '=', data.provider!)
      .executeTakeFirstOrThrow();
  }

  /**
   * Atomically claim up to `limit` pending jobs that are ready to run
   * now. Uses SELECT ... FOR UPDATE SKIP LOCKED so multi-instance
   * workers don't fight over the same row.
   *
   * Marks claimed rows by bumping `attempts` and pushing
   * `next_attempt_at` ~30s out — gives this worker time to finish
   * before another instance picks the same job up again on failure.
   * The worker's `markSucceeded` / `markFailed` overrides the next
   * attempt time as appropriate.
   */
  async claimPending(limit: number, now: Date = new Date()): Promise<OutboundSyncJob[]> {
    return this.db.transaction().execute(async (trx) => {
      const pickIds = await trx
        .selectFrom('outbound_sync_jobs')
        .select('id')
        .where('status', '=', 'pending')
        .where('next_attempt_at', '<=', now as never)
        .orderBy('next_attempt_at', 'asc')
        .limit(limit)
        .forUpdate()
        .modifyEnd(sql`SKIP LOCKED`)
        .execute();
      if (pickIds.length === 0) return [];
      const ids = pickIds.map((r) => r.id);
      // Push next_attempt_at to NOW() + 30s so another worker doesn't
      // re-claim while this one is still processing.
      const nextRetry = new Date(now.getTime() + 30_000);
      return trx
        .updateTable('outbound_sync_jobs')
        .set({ attempts: sql`attempts + 1` as never, next_attempt_at: nextRetry as never })
        .where('id', 'in', ids)
        .returningAll()
        .execute();
    });
  }

  async markSucceeded(
    id: string,
    externalId: string | null,
    externalUrl: string | null,
  ): Promise<void> {
    await this.db
      .updateTable('outbound_sync_jobs')
      .set({
        status: 'succeeded',
        external_id: externalId,
        external_url: externalUrl,
        last_error: null,
        completed_at: new Date(),
      })
      .where('id', '=', id)
      .execute();
  }

  async markFailed(id: string, error: string, nextAttemptAt: Date): Promise<void> {
    await this.db
      .updateTable('outbound_sync_jobs')
      .set({ last_error: error, next_attempt_at: nextAttemptAt as never })
      .where('id', '=', id)
      .execute();
  }

  /**
   * After N retries we give up and stamp 'failed' so it stops being
   * picked up. Worker decides the threshold.
   */
  async markPermanentlyFailed(id: string, error: string): Promise<void> {
    await this.db
      .updateTable('outbound_sync_jobs')
      .set({ status: 'failed', last_error: error, completed_at: new Date() })
      .where('id', '=', id)
      .execute();
  }

  /**
   * When the user disconnects a provider after a job is enqueued, we
   * mark all their pending jobs for that provider 'skipped' instead
   * of letting them retry forever.
   */
  async skipPendingFor(userId: string, provider: string): Promise<void> {
    await this.db
      .updateTable('outbound_sync_jobs')
      .set({ status: 'skipped', completed_at: new Date() })
      .where('user_id', '=', userId)
      .where('provider', '=', provider)
      .where('status', '=', 'pending')
      .execute();
  }

  async listForUser(userId: string, limit = 50): Promise<OutboundSyncJob[]> {
    return this.db
      .selectFrom('outbound_sync_jobs')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
  }

  async updateById(id: string, patch: OutboundSyncJobUpdate): Promise<void> {
    await this.db.updateTable('outbound_sync_jobs').set(patch).where('id', '=', id).execute();
  }
}
