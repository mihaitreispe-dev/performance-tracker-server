import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  AthleteProfileMetrics,
  Database,
  Gender,
  NewAthleteProfileMetrics,
  UpdateAthleteProfileMetrics,
} from 'src/database/interfaces';

@Injectable()
export class AthleteProfileMetricsRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<AthleteProfileMetrics | undefined> {
    return this.db.selectFrom('athlete_profile_metrics').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findByUserId(userId: string): Promise<AthleteProfileMetrics | undefined> {
    return this.db.selectFrom('athlete_profile_metrics').selectAll().where('user_id', '=', userId).executeTakeFirst();
  }

  async create(data: NewAthleteProfileMetrics): Promise<AthleteProfileMetrics> {
    return this.db.insertInto('athlete_profile_metrics').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async update(id: string, data: UpdateAthleteProfileMetrics): Promise<AthleteProfileMetrics | undefined> {
    return this.db
      .updateTable('athlete_profile_metrics')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async upsert(data: NewAthleteProfileMetrics): Promise<AthleteProfileMetrics> {
    return this.db
      .insertInto('athlete_profile_metrics')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['user_id']).doUpdateSet({
          birth_date: data.birth_date,
          gender: data.gender,
          weight_kg: data.weight_kg,
          height_cm: data.height_cm,
          current_vdot: data.current_vdot,
          vdot_source: data.vdot_source,
          vdot_calculated_at: data.vdot_calculated_at,
          years_training: data.years_training,
          weekly_volume_hours: data.weekly_volume_hours,
          sweat_rate_ml_per_hour: data.sweat_rate_ml_per_hour,
          gi_sensitivity: data.gi_sensitivity,
          preferred_carb_sources: data.preferred_carb_sources,
          caffeine_tolerance: data.caffeine_tolerance,
          updated_at: sql`now()`,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateVdot(
    userId: string,
    vdot: number,
    source: string,
    calculatedAt: Date,
  ): Promise<AthleteProfileMetrics | undefined> {
    return this.db
      .updateTable('athlete_profile_metrics')
      .set({
        current_vdot: vdot,
        vdot_source: source,
        vdot_calculated_at: calculatedAt,
        updated_at: sql`now()`,
      })
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('athlete_profile_metrics').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async getGenderByUserId(userId: string): Promise<Gender | null> {
    const result = await this.db
      .selectFrom('athlete_profile_metrics')
      .select('gender')
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!result || !result.gender) {
      return null;
    }

    // Validate that the gender value is a valid Gender type
    if (result.gender === Gender.MALE || result.gender === Gender.FEMALE || result.gender === Gender.OTHER) {
      return result.gender;
    }

    return null;
  }
}
