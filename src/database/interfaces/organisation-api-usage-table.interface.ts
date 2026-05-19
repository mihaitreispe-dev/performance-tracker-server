import { Generated, Insertable, Selectable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * Raw request log for /v1/public/* calls. Written fire-and-forget by the usage
 * interceptor. TTL'd after 30 days by a scheduled job; long-term analytics live in
 * the rollup table below.
 */
export interface OrganisationApiUsageTable {
  id: Generated<string>;
  organisation_id: string;
  /** Nullable because we keep usage history when a key is revoked + tombstoned. */
  api_key_id: string | null;
  /** Route template (e.g. "/v1/public/workouts/:id") — never the raw path. */
  endpoint: string;
  method: string;
  status_code: number;
  response_ms: number;
  created_at: Generated<Timestamp>;
}

export type OrganisationApiUsage = Selectable<OrganisationApiUsageTable>;
export type NewOrganisationApiUsage = Insertable<OrganisationApiUsageTable>;

/** Pre-aggregated counters; populated by the nightly rollup CLI. */
export interface OrganisationApiUsageDailyTable {
  organisation_id: string;
  api_key_id: string | null;
  endpoint: string;
  /** Calendar date (UTC). */
  date: Timestamp;
  request_count: number;
  error_count: number;
  p95_response_ms: number | null;
}

export type OrganisationApiUsageDaily = Selectable<OrganisationApiUsageDailyTable>;
export type NewOrganisationApiUsageDaily = Insertable<OrganisationApiUsageDailyTable>;
