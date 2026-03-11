import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  NewQuickWellnessCheckin,
  QuickWellnessCheckin,
  QuickWellnessCheckinUpdate,
} from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';

export interface QuickWellnessCheckinFilter {
  userId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface QuickWellnessCheckinFindManyOptions {
  filter?: QuickWellnessCheckinFilter;
  offset?: number;
  limit?: number;
}

@Injectable()
export class QuickWellnessCheckinRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<QuickWellnessCheckin | undefined> {
    return this.db.selectFrom('quick_wellness_checkins').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByUserAndDate(userId: string, date: Date): Promise<QuickWellnessCheckin | undefined> {
    const dateStr = formatDateToYMD(date);
    return this.db
      .selectFrom('quick_wellness_checkins')
      .where('user_id', '=', userId)
      .where('checkin_date', '=', dateStr)
      .selectAll()
      .executeTakeFirst();
  }

  async findMany(options: QuickWellnessCheckinFindManyOptions = {}): Promise<QuickWellnessCheckin[]> {
    const { filter, offset, limit } = options;
    let query = this.db.selectFrom('quick_wellness_checkins').selectAll();

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.dateFrom) {
      query = query.where('checkin_date', '>=', formatDateToYMD(filter.dateFrom));
    }
    if (filter?.dateTo) {
      query = query.where('checkin_date', '<=', formatDateToYMD(filter.dateTo));
    }

    query = query.orderBy('checkin_date', 'desc');

    if (offset !== undefined) {
      query = query.offset(offset);
    }
    if (limit !== undefined) {
      query = query.limit(limit);
    }

    return query.execute();
  }

  async getLatestForUser(userId: string): Promise<QuickWellnessCheckin | undefined> {
    return this.db
      .selectFrom('quick_wellness_checkins')
      .where('user_id', '=', userId)
      .selectAll()
      .orderBy('checkin_date', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  async getDateRange(userId: string, days: number): Promise<QuickWellnessCheckin[]> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    return this.db
      .selectFrom('quick_wellness_checkins')
      .where('user_id', '=', userId)
      .where('checkin_date', '>=', formatDateToYMD(dateFrom))
      .selectAll()
      .orderBy('checkin_date', 'asc')
      .execute();
  }

  async create(data: NewQuickWellnessCheckin): Promise<QuickWellnessCheckin> {
    return this.db.insertInto('quick_wellness_checkins').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async upsert(data: NewQuickWellnessCheckin): Promise<QuickWellnessCheckin> {
    return this.db
      .insertInto('quick_wellness_checkins')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['user_id', 'checkin_date']).doUpdateSet({
          sleep_quality: data.sleep_quality,
          energy_level: data.energy_level,
          muscle_soreness: data.muscle_soreness,
          stress_level: data.stress_level,
          training_readiness: data.training_readiness,
          completion_seconds: data.completion_seconds,
          source: data.source,
          updated_at: sql`now()`,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: QuickWellnessCheckinUpdate): Promise<QuickWellnessCheckin> {
    return this.db
      .updateTable('quick_wellness_checkins')
      .set({ ...data, updated_at: sql`now()` } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('quick_wellness_checkins').where('id', '=', id).execute();
  }

  /**
   * Get average wellness score over a period for a user
   */
  async getAverageScores(
    userId: string,
    days: number,
  ): Promise<{
    sleepQuality: number | null;
    energyLevel: number | null;
    muscleSoreness: number | null;
    stressLevel: number | null;
    trainingReadiness: number | null;
  }> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    const result = await this.db
      .selectFrom('quick_wellness_checkins')
      .where('user_id', '=', userId)
      .where('checkin_date', '>=', formatDateToYMD(dateFrom))
      .select([
        (eb) => eb.fn.avg<string>('sleep_quality').as('avg_sleep'),
        (eb) => eb.fn.avg<string>('energy_level').as('avg_energy'),
        (eb) => eb.fn.avg<string>('muscle_soreness').as('avg_soreness'),
        (eb) => eb.fn.avg<string>('stress_level').as('avg_stress'),
        (eb) => eb.fn.avg<string>('training_readiness').as('avg_readiness'),
      ])
      .executeTakeFirst();

    return {
      sleepQuality: result?.avg_sleep ? parseFloat(result.avg_sleep) : null,
      energyLevel: result?.avg_energy ? parseFloat(result.avg_energy) : null,
      muscleSoreness: result?.avg_soreness ? parseFloat(result.avg_soreness) : null,
      stressLevel: result?.avg_stress ? parseFloat(result.avg_stress) : null,
      trainingReadiness: result?.avg_readiness ? parseFloat(result.avg_readiness) : null,
    };
  }
}
