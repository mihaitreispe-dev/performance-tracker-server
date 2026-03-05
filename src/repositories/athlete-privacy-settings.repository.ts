import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  AthletePrivacySettings,
  AthletePrivacySettingsUpdate,
  Database,
  NewAthletePrivacySettings,
} from 'src/database/interfaces';

@Injectable()
export class AthletePrivacySettingsRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findByUserId(userId: string): Promise<AthletePrivacySettings | undefined> {
    return this.db.selectFrom('athlete_privacy_settings').where('user_id', '=', userId).selectAll().executeTakeFirst();
  }

  async create(data: NewAthletePrivacySettings): Promise<AthletePrivacySettings> {
    return this.db.insertInto('athlete_privacy_settings').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateByUserId(userId: string, data: AthletePrivacySettingsUpdate): Promise<AthletePrivacySettings> {
    return this.db
      .updateTable('athlete_privacy_settings')
      .set(data)
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async upsert(userId: string, data: Omit<AthletePrivacySettingsUpdate, 'user_id'>): Promise<AthletePrivacySettings> {
    const existing = await this.findByUserId(userId);
    if (existing) {
      return this.updateByUserId(userId, data);
    }
    return this.create({ user_id: userId, ...data } as NewAthletePrivacySettings);
  }

  async getOrCreateDefault(userId: string): Promise<AthletePrivacySettings> {
    const existing = await this.findByUserId(userId);
    if (existing) {
      return existing;
    }
    return this.create({ user_id: userId });
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.db.deleteFrom('athlete_privacy_settings').where('user_id', '=', userId).execute();
  }
}
