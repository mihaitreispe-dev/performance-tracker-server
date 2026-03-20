import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewSleepBaseline, SleepBaseline, SleepBaselineUpdate } from 'src/database/interfaces';

@Injectable()
export class SleepBaselineRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<SleepBaseline | undefined> {
    return this.db.selectFrom('sleep_baselines').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByUserAndDate(userId: string, date: Date): Promise<SleepBaseline | undefined> {
    return this.db
      .selectFrom('sleep_baselines')
      .where('user_id', '=', userId)
      .where('date', '=', date)
      .selectAll()
      .executeTakeFirst();
  }

  async findByUserAndDateRange(userId: string, startDate: Date, endDate: Date): Promise<SleepBaseline[]> {
    return this.db
      .selectFrom('sleep_baselines')
      .where('user_id', '=', userId)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .orderBy('date', 'desc')
      .selectAll()
      .execute();
  }

  async getLatestForUser(userId: string): Promise<SleepBaseline | undefined> {
    return this.db
      .selectFrom('sleep_baselines')
      .where('user_id', '=', userId)
      .orderBy('date', 'desc')
      .limit(1)
      .selectAll()
      .executeTakeFirst();
  }

  async create(data: NewSleepBaseline): Promise<SleepBaseline> {
    return this.db.insertInto('sleep_baselines').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: SleepBaselineUpdate): Promise<SleepBaseline> {
    return this.db
      .updateTable('sleep_baselines')
      .set({ ...data, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async upsert(userId: string, date: Date, data: Omit<NewSleepBaseline, 'user_id' | 'date'>): Promise<SleepBaseline> {
    const existing = await this.findByUserAndDate(userId, date);
    if (existing) {
      return this.updateById(existing.id, data);
    }
    return this.create({ ...data, user_id: userId, date });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('sleep_baselines').where('id', '=', id).execute();
  }

  async deleteByUserAndDate(userId: string, date: Date): Promise<void> {
    await this.db
      .deleteFrom('sleep_baselines')
      .where('user_id', '=', userId)
      .where('date', '=', date)
      .execute();
  }
}
