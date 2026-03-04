import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  DailyHealthMetric,
  DailyHealthMetricUpdate,
  Database,
  HealthMetricType,
  NewDailyHealthMetric,
  WearableProvider,
} from 'src/database/interfaces';

export interface HealthMetricFilter {
  userId?: string;
  metricType?: HealthMetricType;
  provider?: WearableProvider;
  dateFrom?: Date;
  dateTo?: Date;
}

@Injectable()
export class DailyHealthMetricRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<DailyHealthMetric | undefined> {
    return this.db.selectFrom('daily_health_metrics').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByUserDateAndType(userId: string, date: Date, metricType: HealthMetricType): Promise<DailyHealthMetric[]> {
    return this.db
      .selectFrom('daily_health_metrics')
      .where('user_id', '=', userId)
      .where('metric_date', '=', date)
      .where('metric_type', '=', metricType)
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  }

  async findMany(filter: HealthMetricFilter): Promise<DailyHealthMetric[]> {
    let query = this.db.selectFrom('daily_health_metrics').selectAll();

    if (filter.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter.metricType) {
      query = query.where('metric_type', '=', filter.metricType);
    }
    if (filter.provider) {
      query = query.where('provider', '=', filter.provider);
    }
    if (filter.dateFrom) {
      query = query.where('metric_date', '>=', filter.dateFrom);
    }
    if (filter.dateTo) {
      query = query.where('metric_date', '<=', filter.dateTo);
    }

    return query.orderBy('metric_date', 'desc').execute();
  }

  async findLatestByUserAndType(userId: string, metricType: HealthMetricType): Promise<DailyHealthMetric | undefined> {
    return this.db
      .selectFrom('daily_health_metrics')
      .where('user_id', '=', userId)
      .where('metric_type', '=', metricType)
      .selectAll()
      .orderBy('metric_date', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  async create(data: NewDailyHealthMetric): Promise<DailyHealthMetric> {
    return this.db.insertInto('daily_health_metrics').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async upsert(data: NewDailyHealthMetric): Promise<DailyHealthMetric> {
    return this.db
      .insertInto('daily_health_metrics')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['user_id', 'metric_date', 'metric_type', 'provider']).doUpdateSet({
          value: data.value,
          unit: data.unit,
          external_id: data.external_id,
          recorded_at: data.recorded_at,
          metadata: data.metadata,
          updated_at: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async bulkUpsert(metrics: NewDailyHealthMetric[]): Promise<void> {
    if (metrics.length === 0) return;

    for (const metric of metrics) {
      await this.upsert(metric);
    }
  }

  async updateById(id: string, data: DailyHealthMetricUpdate): Promise<DailyHealthMetric> {
    return this.db
      .updateTable('daily_health_metrics')
      .set({ ...data, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('daily_health_metrics').where('id', '=', id).execute();
  }

  async deleteByUserAndDateRange(userId: string, dateFrom: Date, dateTo: Date): Promise<void> {
    await this.db
      .deleteFrom('daily_health_metrics')
      .where('user_id', '=', userId)
      .where('metric_date', '>=', dateFrom)
      .where('metric_date', '<=', dateTo)
      .execute();
  }
}
