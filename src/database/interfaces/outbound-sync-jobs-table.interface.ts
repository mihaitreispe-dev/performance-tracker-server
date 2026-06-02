import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * Outbound sync job — see 1774403000000 migration for the full design
 * notes (idempotency, retry, multi-instance claim pattern).
 *
 * `provider` is a string (not enum) so adding a new outbound target —
 * Strava, Apple Health, Google Fit, Garmin Connect outbound, future
 * partners — doesn't need a migration.
 */
export type OutboundSyncStatus = 'pending' | 'succeeded' | 'failed' | 'skipped';

export interface OutboundSyncJobsTable {
  id: Generated<string>;
  user_id: string;
  workout_execution_id: string;
  provider: string;
  status: ColumnType<OutboundSyncStatus, OutboundSyncStatus | undefined, OutboundSyncStatus>;
  attempts: ColumnType<number, number | undefined, number>;
  last_error: string | null;
  next_attempt_at: Generated<Timestamp>;
  external_id: string | null;
  external_url: string | null;
  payload: ColumnType<Record<string, unknown>, Record<string, unknown> | undefined, Record<string, unknown>>;
  created_at: Generated<Timestamp>;
  completed_at: Timestamp | null;
}

export type OutboundSyncJob = Selectable<OutboundSyncJobsTable>;
export type NewOutboundSyncJob = Insertable<OutboundSyncJobsTable>;
export type OutboundSyncJobUpdate = Updateable<OutboundSyncJobsTable>;
