import { OutboundSyncJob } from 'src/database/interfaces';

/**
 * Contract every outbound sync provider implements (spec D3).
 *
 * Adding a new provider (Strava, Apple Health, Google Fit, Garmin
 * Connect outbound, future partner) means:
 *   1. Create a class implementing this interface
 *   2. Provide it under the `OUTBOUND_SYNC_PROVIDERS` token in the
 *      module (see OutboundSyncApiModule)
 *
 * The base service handles enqueue / claim / retry / mark-success
 * uniformly; the provider only has to know how to talk to its API.
 */
export interface OutboundSyncProvider {
  /**
   * Stable identifier — must match the `provider` column written to
   * outbound_sync_jobs. Suggested values: 'strava', 'apple_health',
   * 'google_fit', 'garmin_connect'. Lower-snake-case.
   */
  readonly key: string;

  /**
   * Whether this provider is configured server-side (e.g. has its
   * client_id / client_secret / API token loaded from env). When
   * false, the worker skips enqueueing jobs for this provider so
   * users don't accumulate stuck-pending rows for an unconfigured
   * integration.
   */
  isConfigured(): boolean;

  /**
   * Whether THIS user has connected this provider. Most providers
   * need OAuth tokens stored per-user — this method consults that
   * storage. False → the worker skips enqueueing for this user.
   */
  isConnectedForUser(userId: string): Promise<boolean>;

  /**
   * Push the workout to the provider. Throws on permanent failure
   * (the worker stamps 'failed'); throws with `transient: true` on
   * a retry-worthy failure (worker schedules backoff retry).
   *
   * Returns the external system's id + optional URL for the
   * "view in Strava" deep-link.
   */
  push(job: OutboundSyncJob): Promise<{ externalId: string | null; externalUrl: string | null }>;
}

/**
 * Marker thrown when a provider failure should be retried later
 * (rate limit, transient network, 5xx). The worker reads `transient`
 * to decide backoff vs permanent-fail.
 */
export class OutboundSyncError extends Error {
  constructor(
    message: string,
    public readonly transient: boolean = false,
  ) {
    super(message);
    this.name = 'OutboundSyncError';
  }
}

/**
 * DI token bound to an array of registered providers. The service
 * iterates this list on enqueue (which providers does this user have
 * connected?) and looks up by key on claim (which provider should
 * handle this job?).
 */
export const OUTBOUND_SYNC_PROVIDERS = Symbol('OUTBOUND_SYNC_PROVIDERS');
