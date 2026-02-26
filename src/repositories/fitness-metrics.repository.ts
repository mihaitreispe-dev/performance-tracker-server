import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  FitnessMetric,
  FitnessMetricType,
  NewFitnessMetric,
  UpdateFitnessMetric,
} from 'src/database/interfaces';

interface FindManyFilter {
  userId: string;
  metricType?: FitnessMetricType;
  dateFrom?: Date;
  dateTo?: Date;
}

interface FindManyOptions {
  filter: FindManyFilter;
  sort?: { field: 'calculated_at'; direction: 'asc' | 'desc' }[];
  limit?: number;
}

@Injectable()
export class FitnessMetricsRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<FitnessMetric | undefined> {
    return this.db.selectFrom('fitness_metrics').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findMany(options: FindManyOptions): Promise<FitnessMetric[]> {
    let query = this.db.selectFrom('fitness_metrics').selectAll().where('user_id', '=', options.filter.userId);

    if (options.filter.metricType) {
      query = query.where('metric_type', '=', options.filter.metricType);
    }

    if (options.filter.dateFrom) {
      query = query.where('calculated_at', '>=', options.filter.dateFrom);
    }

    if (options.filter.dateTo) {
      query = query.where('calculated_at', '<=', options.filter.dateTo);
    }

    if (options.sort) {
      for (const sort of options.sort) {
        query = query.orderBy(sort.field, sort.direction);
      }
    } else {
      query = query.orderBy('calculated_at', 'desc');
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    return query.execute();
  }

  async getLatestByType(userId: string, metricType: FitnessMetricType): Promise<FitnessMetric | undefined> {
    return this.db
      .selectFrom('fitness_metrics')
      .selectAll()
      .where('user_id', '=', userId)
      .where('metric_type', '=', metricType)
      .orderBy('calculated_at', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  async getLatestAllTypes(userId: string): Promise<FitnessMetric[]> {
    // Get the latest metric for each type using a subquery
    const subquery = this.db
      .selectFrom('fitness_metrics')
      .select(['metric_type', sql<Date>`MAX(calculated_at)`.as('max_calculated_at')])
      .where('user_id', '=', userId)
      .groupBy('metric_type')
      .as('latest');

    return this.db
      .selectFrom('fitness_metrics')
      .innerJoin(subquery, (join) =>
        join
          .onRef('fitness_metrics.metric_type', '=', 'latest.metric_type')
          .onRef('fitness_metrics.calculated_at', '=', 'latest.max_calculated_at'),
      )
      .selectAll('fitness_metrics')
      .where('fitness_metrics.user_id', '=', userId)
      .execute();
  }

  async getHistory(userId: string, metricType: FitnessMetricType, days: number = 90): Promise<FitnessMetric[]> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    return this.db
      .selectFrom('fitness_metrics')
      .selectAll()
      .where('user_id', '=', userId)
      .where('metric_type', '=', metricType)
      .where('calculated_at', '>=', dateFrom)
      .orderBy('calculated_at', 'asc')
      .execute();
  }

  async create(data: NewFitnessMetric): Promise<FitnessMetric> {
    return this.db.insertInto('fitness_metrics').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async update(id: string, data: UpdateFitnessMetric): Promise<FitnessMetric | undefined> {
    return this.db
      .updateTable('fitness_metrics')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('fitness_metrics').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async deleteByUserAndType(userId: string, metricType: FitnessMetricType): Promise<number> {
    const result = await this.db
      .deleteFrom('fitness_metrics')
      .where('user_id', '=', userId)
      .where('metric_type', '=', metricType)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
