import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { CardioMetric, CardioMetricType, Database, NewCardioMetric } from 'src/database/interfaces';

export interface CardioMetricFilter {
  workoutExecutionId?: string;
  metricType?: CardioMetricType;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface CardioMetricSort {
  field: 'recorded_at' | 'created_at';
  direction?: 'asc' | 'desc';
}

export interface CardioMetricFindManyOptions {
  filter?: CardioMetricFilter;
  sort?: CardioMetricSort[];
  offset?: number;
  limit?: number;
}

@Injectable()
export class CardioMetricsRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<CardioMetric | undefined> {
    return this.db.selectFrom('cardio_metrics').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByExecutionId(workoutExecutionId: string): Promise<CardioMetric[]> {
    return this.db
      .selectFrom('cardio_metrics')
      .where('workout_execution_id', '=', workoutExecutionId)
      .selectAll()
      .orderBy('recorded_at', 'asc')
      .execute();
  }

  async findMany(options: CardioMetricFindManyOptions = {}): Promise<CardioMetric[]> {
    const { filter, sort, offset, limit } = options;
    let query = this.db.selectFrom('cardio_metrics').selectAll();

    if (filter?.workoutExecutionId) {
      query = query.where('workout_execution_id', '=', filter.workoutExecutionId);
    }
    if (filter?.metricType) {
      query = query.where('metric_type', '=', filter.metricType);
    }
    if (filter?.dateFrom) {
      query = query.where('recorded_at', '>=', filter.dateFrom);
    }
    if (filter?.dateTo) {
      query = query.where('recorded_at', '<=', filter.dateTo);
    }

    if (sort && sort.length > 0) {
      for (const s of sort) {
        query = query.orderBy(s.field, s.direction ?? 'asc');
      }
    } else {
      query = query.orderBy('recorded_at', 'asc');
    }

    if (offset !== undefined) {
      query = query.offset(offset);
    }
    if (limit !== undefined) {
      query = query.limit(limit);
    }

    return query.execute();
  }

  async countMany(filter?: CardioMetricFilter): Promise<number> {
    let query = this.db.selectFrom('cardio_metrics').select((eb) => eb.fn.countAll<number>().as('count'));

    if (filter?.workoutExecutionId) {
      query = query.where('workout_execution_id', '=', filter.workoutExecutionId);
    }
    if (filter?.metricType) {
      query = query.where('metric_type', '=', filter.metricType);
    }
    if (filter?.dateFrom) {
      query = query.where('recorded_at', '>=', filter.dateFrom);
    }
    if (filter?.dateTo) {
      query = query.where('recorded_at', '<=', filter.dateTo);
    }

    const result = await query.executeTakeFirstOrThrow();
    return Number(result.count);
  }

  async create(data: NewCardioMetric): Promise<CardioMetric> {
    return this.db.insertInto('cardio_metrics').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async createMany(data: NewCardioMetric[]): Promise<CardioMetric[]> {
    if (data.length === 0) return [];
    return this.db.insertInto('cardio_metrics').values(data).returningAll().execute();
  }

  async deleteByExecutionId(workoutExecutionId: string): Promise<void> {
    await this.db.deleteFrom('cardio_metrics').where('workout_execution_id', '=', workoutExecutionId).execute();
  }

  async getAggregatedMetrics(
    workoutExecutionId: string,
    metricType: CardioMetricType,
  ): Promise<{ min: number; max: number; avg: number } | undefined> {
    const result = await this.db
      .selectFrom('cardio_metrics')
      .select((eb) => [
        eb.fn.min<string>('value').as('min'),
        eb.fn.max<string>('value').as('max'),
        eb.fn.avg<string>('value').as('avg'),
      ])
      .where('workout_execution_id', '=', workoutExecutionId)
      .where('metric_type', '=', metricType)
      .executeTakeFirst();

    if (!result || result.min === null) {
      return undefined;
    }

    return {
      min: Number.parseFloat(result.min),
      max: Number.parseFloat(result.max),
      avg: Number.parseFloat(result.avg),
    };
  }
}
