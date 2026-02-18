import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewUserSettings, UserSettings, UserSettingsUpdate } from 'src/database/interfaces';

@Injectable()
export class UserSettingsRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findByUserId(userId: string): Promise<UserSettings | undefined> {
    return this.db.selectFrom('user_settings').where('user_id', '=', userId).selectAll().executeTakeFirst();
  }

  async create(data: NewUserSettings): Promise<UserSettings> {
    return this.db.insertInto('user_settings').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateByUserId(userId: string, data: UserSettingsUpdate): Promise<UserSettings> {
    return this.db
      .updateTable('user_settings')
      .set({ ...data, updated_at: sql`now()` } as any)
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async upsert(userId: string, data: Omit<UserSettingsUpdate, 'user_id'>): Promise<UserSettings> {
    const existing = await this.findByUserId(userId);
    if (existing) {
      return this.updateByUserId(userId, data);
    }
    return this.create({ user_id: userId, ...data } as NewUserSettings);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.db.deleteFrom('user_settings').where('user_id', '=', userId).execute();
  }
}
