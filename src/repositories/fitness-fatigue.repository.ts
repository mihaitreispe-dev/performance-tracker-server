import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  FitnessFatigueDaily,
  NewFitnessFatigueDaily,
  UpdateFitnessFatigueDaily,
} from 'src/database/interfaces';
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
export class FitnessFatigueRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<FitnessFatigueDaily | undefined> {
    return this.db.selectFrom('fitness_fatigue_daily').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findByUserAndDate(userId: string, date: Date): Promise<FitnessFatigueDaily | undefined> {
    const dateStr = formatDateToYMD(date);
    return this.db
      .selectFrom('fitness_fatigue_daily')
      .selectAll()
      .where('user_id', '=', userId)
      .where(sql`date::text`, '=', dateStr)
      .executeTakeFirst();
  }

  async findMany(options: FindManyOptions): Promise<FitnessFatigueDaily[]> {
    let query = this.db.selectFrom('fitness_fatigue_daily').selectAll().where('user_id', '=', options.filter.userId);

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

  async getLatestForUser(userId: string): Promise<FitnessFatigueDaily | undefined> {
    return this.db
      .selectFrom('fitness_fatigue_daily')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('date', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  async getDateRange(userId: string, days: number = 90): Promise<FitnessFatigueDaily[]> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);
    const dateFromStr = formatDateToYMD(dateFrom);

    return this.db
      .selectFrom('fitness_fatigue_daily')
      .selectAll()
      .where('user_id', '=', userId)
      .where(sql`date::text`, '>=', dateFromStr)
      .orderBy('date', 'asc')
      .execute();
  }

  async create(data: NewFitnessFatigueDaily): Promise<FitnessFatigueDaily> {
    return this.db.insertInto('fitness_fatigue_daily').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async upsert(data: NewFitnessFatigueDaily): Promise<FitnessFatigueDaily> {
    return this.db
      .insertInto('fitness_fatigue_daily')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['user_id', 'date']).doUpdateSet({
          ctl: data.ctl,
          atl: data.atl,
          tsb: data.tsb,
          daily_tss: data.daily_tss,
          ramp_rate: data.ramp_rate,
          workout_count: data.workout_count,
          metadata: data.metadata,
          updated_at: sql`now()`,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(id: string, data: UpdateFitnessFatigueDaily): Promise<FitnessFatigueDaily | undefined> {
    return this.db
      .updateTable('fitness_fatigue_daily')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('fitness_fatigue_daily').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async deleteByUserAndDateRange(userId: string, dateFrom: Date, dateTo: Date): Promise<number> {
    const dateFromStr = formatDateToYMD(dateFrom);
    const dateToStr = formatDateToYMD(dateTo);

    const result = await this.db
      .deleteFrom('fitness_fatigue_daily')
      .where('user_id', '=', userId)
      .where(sql`date::text`, '>=', dateFromStr)
      .where(sql`date::text`, '<=', dateToStr)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  async getDaysWithData(userId: string, dateFrom: Date, dateTo: Date): Promise<string[]> {
    const dateFromStr = formatDateToYMD(dateFrom);
    const dateToStr = formatDateToYMD(dateTo);

    const results = await this.db
      .selectFrom('fitness_fatigue_daily')
      .select(sql<string>`date::text`.as('date_str'))
      .where('user_id', '=', userId)
      .where(sql`date::text`, '>=', dateFromStr)
      .where(sql`date::text`, '<=', dateToStr)
      .execute();

    return results.map((r) => r.date_str);
  }
}
