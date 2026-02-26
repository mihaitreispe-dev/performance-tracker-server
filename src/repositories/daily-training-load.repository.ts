import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DailyTrainingLoad, Database, NewDailyTrainingLoad, UpdateDailyTrainingLoad } from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';

interface FindManyFilter {
  userId: string;
  dateFrom?: Date;
  dateTo?: Date;
}

interface FindManyOptions {
  filter: FindManyFilter;
  sort?: { field: 'date'; direction: 'asc' | 'desc' }[];
  limit?: number;
}

@Injectable()
export class DailyTrainingLoadRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<DailyTrainingLoad | undefined> {
    return this.db.selectFrom('daily_training_loads').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findByUserAndDate(userId: string, date: Date): Promise<DailyTrainingLoad | undefined> {
    const dateStr = formatDateToYMD(date);
    return this.db
      .selectFrom('daily_training_loads')
      .selectAll()
      .where('user_id', '=', userId)
      .where(sql`date::text`, '=', dateStr)
      .executeTakeFirst();
  }

  async findMany(options: FindManyOptions): Promise<DailyTrainingLoad[]> {
    let query = this.db.selectFrom('daily_training_loads').selectAll().where('user_id', '=', options.filter.userId);

    if (options.filter.dateFrom) {
      const dateFromStr = formatDateToYMD(options.filter.dateFrom);
      query = query.where(sql`date::text`, '>=', dateFromStr);
    }

    if (options.filter.dateTo) {
      const dateToStr = formatDateToYMD(options.filter.dateTo);
      query = query.where(sql`date::text`, '<=', dateToStr);
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

  async create(data: NewDailyTrainingLoad): Promise<DailyTrainingLoad> {
    return this.db.insertInto('daily_training_loads').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async upsert(data: NewDailyTrainingLoad): Promise<DailyTrainingLoad> {
    return this.db
      .insertInto('daily_training_loads')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['user_id', 'date']).doUpdateSet({
          daily_load: data.daily_load,
          acute_load: data.acute_load,
          chronic_load: data.chronic_load,
          acwr: data.acwr,
          fatigue_score: data.fatigue_score,
          fitness_score: data.fitness_score,
          form_score: data.form_score,
          hr_load_contribution: data.hr_load_contribution,
          duration_load_contribution: data.duration_load_contribution,
          volume_load_contribution: data.volume_load_contribution,
          workout_count: data.workout_count,
          updated_at: sql`now()`,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(id: string, data: UpdateDailyTrainingLoad): Promise<DailyTrainingLoad | undefined> {
    return this.db
      .updateTable('daily_training_loads')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('daily_training_loads').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async getLatestForUser(userId: string): Promise<DailyTrainingLoad | undefined> {
    return this.db
      .selectFrom('daily_training_loads')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('date', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  async getDaysWithData(userId: string, dateFrom: Date, dateTo: Date): Promise<string[]> {
    const dateFromStr = formatDateToYMD(dateFrom);
    const dateToStr = formatDateToYMD(dateTo);

    const results = await this.db
      .selectFrom('daily_training_loads')
      .select(sql<string>`date::text`.as('date_str'))
      .where('user_id', '=', userId)
      .where(sql`date::text`, '>=', dateFromStr)
      .where(sql`date::text`, '<=', dateToStr)
      .execute();

    return results.map((r) => r.date_str);
  }
}
