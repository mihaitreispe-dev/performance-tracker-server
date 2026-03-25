import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewRacePlan, RacePlan, RacePlanStatus, UpdateRacePlan } from 'src/database/interfaces';

interface FindManyOptions {
  userId: string;
  athleteRaceId?: string;
  status?: RacePlanStatus;
  limit?: number;
}

@Injectable()
export class RacePlanRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<RacePlan | undefined> {
    return this.db.selectFrom('race_plans').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findActiveByRace(userId: string, athleteRaceId: string): Promise<RacePlan | undefined> {
    return this.db
      .selectFrom('race_plans')
      .selectAll()
      .where('user_id', '=', userId)
      .where('athlete_race_id', '=', athleteRaceId)
      .where('status', '=', RacePlanStatus.ACTIVE)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  async findMany(options: FindManyOptions): Promise<RacePlan[]> {
    let query = this.db.selectFrom('race_plans').selectAll().where('user_id', '=', options.userId);

    if (options.athleteRaceId) {
      query = query.where('athlete_race_id', '=', options.athleteRaceId);
    }

    if (options.status) {
      query = query.where('status', '=', options.status);
    }

    query = query.orderBy('created_at', 'desc');

    if (options.limit) {
      query = query.limit(options.limit);
    }

    return query.execute();
  }

  async findAllForRace(userId: string, athleteRaceId: string): Promise<RacePlan[]> {
    return this.db
      .selectFrom('race_plans')
      .selectAll()
      .where('user_id', '=', userId)
      .where('athlete_race_id', '=', athleteRaceId)
      .orderBy('plan_version', 'desc')
      .execute();
  }

  async create(data: NewRacePlan): Promise<RacePlan> {
    return this.db.insertInto('race_plans').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async update(id: string, data: UpdateRacePlan): Promise<RacePlan | undefined> {
    return this.db
      .updateTable('race_plans')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async supersedePrevious(userId: string, athleteRaceId: string): Promise<number> {
    const result = await this.db
      .updateTable('race_plans')
      .set({ status: RacePlanStatus.SUPERSEDED, updated_at: sql`now()` })
      .where('user_id', '=', userId)
      .where('athlete_race_id', '=', athleteRaceId)
      .where('status', '=', RacePlanStatus.ACTIVE)
      .executeTakeFirst();

    return Number(result.numUpdatedRows);
  }

  async getNextVersionNumber(userId: string, athleteRaceId: string): Promise<number> {
    const result = await this.db
      .selectFrom('race_plans')
      .select(sql<number>`COALESCE(MAX(plan_version), 0) + 1`.as('next_version'))
      .where('user_id', '=', userId)
      .where('athlete_race_id', '=', athleteRaceId)
      .executeTakeFirst();

    return result?.next_version ?? 1;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('race_plans').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async deleteByAthleteRaceId(athleteRaceId: string): Promise<number> {
    const result = await this.db.deleteFrom('race_plans').where('athlete_race_id', '=', athleteRaceId).executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  async findActivePlansForUpcomingRaces(daysAhead: number): Promise<RacePlan[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

    return this.db
      .selectFrom('race_plans')
      .innerJoin('athlete_races', 'race_plans.athlete_race_id', 'athlete_races.id')
      .selectAll('race_plans')
      .where('race_plans.status', '=', RacePlanStatus.ACTIVE)
      .where((eb) =>
        eb.or([
          eb('athlete_races.manual_date', '>=', new Date()),
          eb('athlete_races.manual_date', '<=', cutoffDate),
        ]),
      )
      .execute();
  }
}
