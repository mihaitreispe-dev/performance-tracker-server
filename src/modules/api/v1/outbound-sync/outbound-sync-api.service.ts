import { Inject, Injectable, Logger } from '@nestjs/common';
import { WorkoutExecution } from 'src/database/interfaces';
import { OutboundSyncJobRepository } from 'src/repositories/outbound-sync-job.repository';

import {
  OutboundSyncError,
  OutboundSyncProvider,
  OUTBOUND_SYNC_PROVIDERS,
} from './outbound-sync-provider.interface';

/**
 * Outbound sync orchestration (spec D3). Two responsibilities:
 *
 *  1. **Enqueue** — given a finished workout execution, create one
 *     pending sync job per provider that:
 *       - is configured server-side AND
 *       - this user has connected
 *     Idempotent via the DB unique constraint, so re-completing the
 *     same execution (multi-device race) doesn't double-enqueue.
 *
 *  2. **Worker** — claim pending jobs, dispatch to the matching
 *     provider, stamp succeeded / retry / permanently-failed based
 *     on the result. Designed for a cron to call `runWorker()`
 *     periodically; lightweight enough to fit alongside the
 *     in-process schedulers, scales out to a separate worker
 *     process by re-providing this service in a worker module
 *     without changing this code.
 */
@Injectable()
export class OutboundSyncApiService {
  private readonly logger = new Logger(OutboundSyncApiService.name);
  /**
   * After this many attempts, give up on the job. 5 covers the
   * common Strava 503 / rate-limit blips that resolve in 30-300s;
   * beyond that the partner is likely down for hours and we don't
   * want to keep churning.
   */
  private readonly MAX_ATTEMPTS = 5;

  constructor(
    private readonly repo: OutboundSyncJobRepository,
    @Inject(OUTBOUND_SYNC_PROVIDERS)
    private readonly providers: OutboundSyncProvider[],
  ) {}

  /**
   * Fire after `finishWorkout` succeeds. Skips providers that aren't
   * configured server-side (no API creds) or that this user hasn't
   * connected (no OAuth tokens).
   *
   * `payload` is a snapshot of execution-side data the providers
   * need at push time. Snapshotting at enqueue insulates the worker
   * from concurrent edits.
   */
  async enqueueForExecution(
    execution: WorkoutExecution,
    payload: Record<string, unknown>,
  ): Promise<void> {
    for (const provider of this.providers) {
      if (!provider.isConfigured()) continue;
      try {
        if (!(await provider.isConnectedForUser(execution.user_id))) continue;
      } catch (err) {
        this.logger.warn(
          `Provider ${provider.key} isConnectedForUser threw — skipping enqueue: ${err}`,
        );
        continue;
      }
      await this.repo.enqueue({
        user_id: execution.user_id,
        workout_execution_id: execution.id,
        provider: provider.key,
        payload,
      });
    }
  }

  /**
   * Cron entry-point. Pulls a batch of pending jobs and processes
   * each. `limit` bounds the per-tick concurrency; a small number
   * (10) is fine for v1 — providers are network-bound so a tighter
   * limit makes the overall throughput predictable.
   *
   * Returns the count of jobs handled (any status) so cron can log /
   * alert on sustained zero throughput.
   */
  async runWorker(limit = 10): Promise<number> {
    const claimed = await this.repo.claimPending(limit);
    if (claimed.length === 0) return 0;

    // Process in parallel — providers are independent + the DB has
    // already pushed next_attempt_at out so we won't double-claim.
    await Promise.all(claimed.map((job) => this.process(job)));

    return claimed.length;
  }

  private async process(job: { id: string; provider: string; attempts: number }): Promise<void> {
    const provider = this.providers.find((p) => p.key === job.provider);
    if (!provider) {
      await this.repo.markPermanentlyFailed(
        job.id,
        `No registered provider for key '${job.provider}'`,
      );
      return;
    }

    try {
      const { externalId, externalUrl } = await provider.push(job as never);
      await this.repo.markSucceeded(job.id, externalId, externalUrl);
    } catch (err) {
      const transient = err instanceof OutboundSyncError ? err.transient : true;
      const message = err instanceof Error ? err.message : String(err);

      if (!transient || job.attempts >= this.MAX_ATTEMPTS) {
        await this.repo.markPermanentlyFailed(job.id, message);
        this.logger.warn(
          `Outbound sync ${job.provider} job ${job.id} permanently failed: ${message}`,
        );
        return;
      }

      // Exponential backoff: 30s → 2m → 8m → 32m → 128m. After
      // MAX_ATTEMPTS we won't hit the last rung; matches the
      // "wait long enough that the partner's transient issue
      // probably cleared" pattern.
      const delaySeconds = 30 * Math.pow(4, job.attempts);
      const nextAttemptAt = new Date(Date.now() + delaySeconds * 1000);
      await this.repo.markFailed(job.id, message, nextAttemptAt);
    }
  }

  /** Called when a user disconnects a provider — clears their pending queue. */
  async cancelPendingForUserProvider(userId: string, providerKey: string): Promise<void> {
    await this.repo.skipPendingFor(userId, providerKey);
  }

  /** History for the user-facing settings UI. */
  listForUser(userId: string, limit = 50) {
    return this.repo.listForUser(userId, limit);
  }
}
