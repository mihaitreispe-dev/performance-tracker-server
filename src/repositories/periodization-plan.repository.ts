import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database } from 'src/database/interfaces/database.interface';
import {
  PeriodizationCreator,
  PeriodizationPhase,
  PeriodizationPlan,
  PeriodizationStatus,
} from 'src/database/interfaces/periodization-plans-table.interface';

export interface CreatePeriodizationPlanInput {
  athlete_race_id: string;
  status: PeriodizationStatus;
  phases: PeriodizationPhase[];
  created_by: PeriodizationCreator;
}

export interface UpdatePeriodizationPlanInput {
  phases?: PeriodizationPhase[];
  status?: PeriodizationStatus;
}

@Injectable()
export class PeriodizationPlanRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<PeriodizationPlan | undefined> {
    return this.db.selectFrom('periodization_plans').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByAthleteRaceId(athleteRaceId: string): Promise<PeriodizationPlan | undefined> {
    return this.db
      .selectFrom('periodization_plans')
      .where('athlete_race_id', '=', athleteRaceId)
      .selectAll()
      .executeTakeFirst();
  }

  async create(data: CreatePeriodizationPlanInput): Promise<PeriodizationPlan> {
    return this.db
      .insertInto('periodization_plans')
      .values({
        athlete_race_id: data.athlete_race_id,
        status: data.status,
        phases: JSON.stringify(data.phases),
        created_by: data.created_by,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: UpdatePeriodizationPlanInput): Promise<PeriodizationPlan> {
    const updateData: Record<string, unknown> = { modified_at: sql`now()` };

    if (data.status !== undefined) {
      updateData.status = data.status;
    }
    if (data.phases !== undefined) {
      updateData.phases = JSON.stringify(data.phases);
    }

    return this.db
      .updateTable('periodization_plans')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async upsertByAthleteRaceId(
    athleteRaceId: string,
    data: Omit<CreatePeriodizationPlanInput, 'athlete_race_id'>,
  ): Promise<PeriodizationPlan> {
    const existing = await this.findByAthleteRaceId(athleteRaceId);
    if (existing) {
      return this.updateById(existing.id, {
        phases: data.phases,
        status: data.status,
      });
    }
    return this.create({ ...data, athlete_race_id: athleteRaceId });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('periodization_plans').where('id', '=', id).execute();
  }

  async deleteByAthleteRaceId(athleteRaceId: string): Promise<void> {
    await this.db.deleteFrom('periodization_plans').where('athlete_race_id', '=', athleteRaceId).execute();
  }
}
