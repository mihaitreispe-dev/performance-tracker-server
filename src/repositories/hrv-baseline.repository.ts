import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  HrvBaselineDaily,
  NewHrvBaselineDaily,
  UpdateHrvBaselineDaily,
} from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';

interface FindManyFilter {
  userId: string;
  dateFrom?: Date;
  dateTo?: Date;
  isSuppressed?: boolean;
}

interface FindManyOptions {
  filter: FindManyFilter;
  sort?: { field: 'date'; direction: 'asc' | 'desc' }[];
  limit?: number;
}

@Injectable()
export class HrvBaselineRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<HrvBaselineDaily | undefined> {
    return this.db.selectFrom('hrv_baseline_daily').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findByUserAndDate(userId: string, date: Date): Promise<HrvBaselineDaily | undefined> {
    const dateStr = formatDateToYMD(date);
    return this.db
      .selectFrom('hrv_baseline_daily')
      .selectAll()
      .where('user_id', '=', userId)
      .where(sql`date::text`, '=', dateStr)
      .executeTakeFirst();
  }

  async findMany(options: FindManyOptions): Promise<HrvBaselineDaily[]> {
    let query = this.db.selectFrom('hrv_baseline_daily').selectAll().where('user_id', '=', options.filter.userId);

    if (options.filter.dateFrom) {
      const dateFromStr = formatDateToYMD(options.filter.dateFrom);
      query = query.where(sql`date::text`, '>=', dateFromStr);
    }

    if (options.filter.dateTo) {
      const dateToStr = formatDateToYMD(options.filter.dateTo);
      query = query.where(sql`date::text`, '<=', dateToStr);
    }

    if (options.filter.isSuppressed !== undefined) {
      query = query.where('is_suppressed', '=', options.filter.isSuppressed);
    }

    if (options.sort) {
      for (const sort of options.sort) {
        query = query.orderBy(sort.field, sort.direction);
      }
    } else {
      query = query.orderBy('date', 'desc');
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    return query.execute();
  }

  async getLatestForUser(userId: string): Promise<HrvBaselineDaily | undefined> {
    return this.db
      .selectFrom('hrv_baseline_daily')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('date', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  async getRecentBaseline(userId: string, days: number = 7): Promise<HrvBaselineDaily[]> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);
    const dateFromStr = formatDateToYMD(dateFrom);

    return this.db
      .selectFrom('hrv_baseline_daily')
      .selectAll()
      .where('user_id', '=', userId)
      .where(sql`date::text`, '>=', dateFromStr)
      .orderBy('date', 'asc')
      .execute();
  }

  async getDateRange(userId: string, days: number = 90): Promise<HrvBaselineDaily[]> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);
    const dateFromStr = formatDateToYMD(dateFrom);

    return this.db
      .selectFrom('hrv_baseline_daily')
      .selectAll()
      .where('user_id', '=', userId)
      .where(sql`date::text`, '>=', dateFromStr)
      .orderBy('date', 'asc')
      .execute();
  }

  async create(data: NewHrvBaselineDaily): Promise<HrvBaselineDaily> {
    return this.db.insertInto('hrv_baseline_daily').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async upsert(data: NewHrvBaselineDaily): Promise<HrvBaselineDaily> {
    return this.db
      .insertInto('hrv_baseline_daily')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['user_id', 'date']).doUpdateSet({
          hrv_value: data.hrv_value,
          resting_hr: data.resting_hr,
          hrv_7day_avg: data.hrv_7day_avg,
          hrv_7day_std: data.hrv_7day_std,
          hrv_zscore: data.hrv_zscore,
          is_suppressed: data.is_suppressed,
          suppression_severity: data.suppression_severity,
          metadata: data.metadata,
          updated_at: sql`now()`,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(id: string, data: UpdateHrvBaselineDaily): Promise<HrvBaselineDaily | undefined> {
    return this.db
      .updateTable('hrv_baseline_daily')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('hrv_baseline_daily').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async getSuppressionHistory(userId: string, days: number = 30): Promise<HrvBaselineDaily[]> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);
    const dateFromStr = formatDateToYMD(dateFrom);

    return this.db
      .selectFrom('hrv_baseline_daily')
      .selectAll()
      .where('user_id', '=', userId)
      .where('is_suppressed', '=', true)
      .where(sql`date::text`, '>=', dateFromStr)
      .orderBy('date', 'desc')
      .execute();
  }

  async getHrvStats(
    userId: string,
    days: number = 30,
  ): Promise<{
    avgHrv: number | null;
    avgRhr: number | null;
    minHrv: number | null;
    maxHrv: number | null;
    suppressionDays: number;
  }> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);
    const dateFromStr = formatDateToYMD(dateFrom);

    const result = await this.db
      .selectFrom('hrv_baseline_daily')
      .select([
        sql<number>`AVG(hrv_value::numeric)`.as('avgHrv'),
        sql<number>`AVG(resting_hr::numeric)`.as('avgRhr'),
        sql<number>`MIN(hrv_value::numeric)`.as('minHrv'),
        sql<number>`MAX(hrv_value::numeric)`.as('maxHrv'),
        sql<number>`SUM(CASE WHEN is_suppressed THEN 1 ELSE 0 END)`.as('suppressionDays'),
      ])
      .where('user_id', '=', userId)
      .where(sql`date::text`, '>=', dateFromStr)
      .executeTakeFirst();

    return {
      avgHrv: result?.avgHrv ?? null,
      avgRhr: result?.avgRhr ?? null,
      minHrv: result?.minHrv ?? null,
      maxHrv: result?.maxHrv ?? null,
      suppressionDays: Number(result?.suppressionDays ?? 0),
    };
  }
}
