import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';

import {
  Database,
  NewOrganisationApiUsage,
  OrganisationApiUsageDaily,
} from 'src/database/interfaces';

export interface UsageDailyPoint {
  date: string;
  endpoint: string;
  requestCount: number;
  errorCount: number;
  p95ResponseMs: number | null;
}

@Injectable()
export class OrganisationApiUsageRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  /** One row per public API call. Called from the usage interceptor; fire-and-forget. */
  async insert(row: NewOrganisationApiUsage): Promise<void> {
    await this.db.insertInto('organisation_api_usage').values(row).execute();
  }

  /**
   * Returns daily counters for the org over a date range. Pulls from the rollup table
   * when a row is available, falls back to live aggregation against the raw log for
   * the current day (which the rollup hasn't reached yet).
   */
  async dailyForRange(
    organisationId: string,
    from: Date,
    to: Date,
  ): Promise<UsageDailyPoint[]> {
    const rolled = await this.db
      .selectFrom('organisation_api_usage_daily')
      .where('organisation_id', '=', organisationId)
      .where('date', '>=', from)
      .where('date', '<=', to)
      .select(['date', 'endpoint', 'request_count', 'error_count', 'p95_response_ms'])
      .execute();

    return rolled.map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
      endpoint: r.endpoint,
      requestCount: r.request_count,
      errorCount: r.error_count,
      p95ResponseMs: r.p95_response_ms,
    }));
  }

  /** Live aggregation, used by the rollup CLI to populate the daily table. */
  async aggregateForDate(date: Date): Promise<OrganisationApiUsageDaily[]> {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    // Use raw SQL — the typed builder gets confused by the percentile_disc /
    // groupBy combination and the dynamic interval window.
    const result = await sql<{
      organisation_id: string;
      api_key_id: string | null;
      endpoint: string;
      request_count: string;
      error_count: string;
      p95_response_ms: string | null;
    }>`
      SELECT
        organisation_id,
        api_key_id,
        endpoint,
        COUNT(*)::text AS request_count,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END)::text AS error_count,
        percentile_disc(0.95) WITHIN GROUP (ORDER BY response_ms)::text AS p95_response_ms
      FROM organisation_api_usage
      WHERE created_at >= ${start}
        AND created_at <  ${end}
      GROUP BY organisation_id, api_key_id, endpoint
    `.execute(this.db);

    return result.rows.map((r) => ({
      organisation_id: r.organisation_id,
      api_key_id: r.api_key_id,
      endpoint: r.endpoint,
      date: start as never,
      request_count: Number(r.request_count),
      error_count: Number(r.error_count),
      p95_response_ms: r.p95_response_ms === null ? null : Math.round(Number(r.p95_response_ms)),
    }));
  }

  async upsertDaily(rows: OrganisationApiUsageDaily[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db
      .insertInto('organisation_api_usage_daily')
      .values(rows)
      .onConflict((oc) =>
        oc.columns(['organisation_id', 'api_key_id', 'endpoint', 'date']).doUpdateSet((eb) => ({
          request_count: eb.ref('excluded.request_count'),
          error_count: eb.ref('excluded.error_count'),
          p95_response_ms: eb.ref('excluded.p95_response_ms'),
        })),
      )
      .execute();
  }

  /** Drop raw rows older than `keepDays`. Called by the same rollup CLI. */
  async pruneRaw(keepDays: number): Promise<number> {
    const result = await sql`
      DELETE FROM organisation_api_usage
      WHERE created_at < now() - make_interval(days => ${keepDays})
    `.execute(this.db);
    return Number(result.numAffectedRows ?? 0);
  }
}
