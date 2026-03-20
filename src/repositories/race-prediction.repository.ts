import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  NewRacePrediction,
  PredictionStatus,
  RacePrediction,
  RaceSport,
  UpdateRacePrediction,
} from 'src/database/interfaces';

interface FindManyFilter {
  userId: string;
  athleteRaceId?: string;
  sport?: RaceSport;
  status?: PredictionStatus;
  dateFrom?: Date;
  dateTo?: Date;
}

interface FindManyOptions {
  filter: FindManyFilter;
  sort?: { field: 'created_at' | 'race_date'; direction: 'asc' | 'desc' }[];
  limit?: number;
}

@Injectable()
export class RacePredictionRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<RacePrediction | undefined> {
    return this.db.selectFrom('race_predictions').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findMany(options: FindManyOptions): Promise<RacePrediction[]> {
    let query = this.db.selectFrom('race_predictions').selectAll().where('user_id', '=', options.filter.userId);

    if (options.filter.athleteRaceId) {
      query = query.where('athlete_race_id', '=', options.filter.athleteRaceId);
    }

    if (options.filter.sport) {
      query = query.where('sport', '=', options.filter.sport);
    }

    if (options.filter.status) {
      query = query.where('status', '=', options.filter.status);
    }

    if (options.filter.dateFrom) {
      query = query.where('race_date', '>=', options.filter.dateFrom);
    }

    if (options.filter.dateTo) {
      query = query.where('race_date', '<=', options.filter.dateTo);
    }

    if (options.sort) {
      for (const sort of options.sort) {
        query = query.orderBy(sort.field, sort.direction);
      }
    } else {
      query = query.orderBy('created_at', 'desc');
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    return query.execute();
  }

  async findCurrentForRace(userId: string, athleteRaceId: string): Promise<RacePrediction | undefined> {
    return this.db
      .selectFrom('race_predictions')
      .selectAll()
      .where('user_id', '=', userId)
      .where('athlete_race_id', '=', athleteRaceId)
      .where('status', '=', PredictionStatus.CURRENT)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  async findAllForRace(userId: string, athleteRaceId: string): Promise<RacePrediction[]> {
    return this.db
      .selectFrom('race_predictions')
      .selectAll()
      .where('user_id', '=', userId)
      .where('athlete_race_id', '=', athleteRaceId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  async create(data: NewRacePrediction): Promise<RacePrediction> {
    return this.db.insertInto('race_predictions').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async update(id: string, data: UpdateRacePrediction): Promise<RacePrediction | undefined> {
    return this.db
      .updateTable('race_predictions')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async supersedePreviousPredictions(userId: string, athleteRaceId: string): Promise<number> {
    const result = await this.db
      .updateTable('race_predictions')
      .set({ status: PredictionStatus.SUPERSEDED, updated_at: sql`now()` })
      .where('user_id', '=', userId)
      .where('athlete_race_id', '=', athleteRaceId)
      .where('status', '=', PredictionStatus.CURRENT)
      .executeTakeFirst();

    return Number(result.numUpdatedRows);
  }

  async markAsHistorical(id: string): Promise<RacePrediction | undefined> {
    return this.db
      .updateTable('race_predictions')
      .set({ status: PredictionStatus.HISTORICAL, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('race_predictions').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async deleteByAthleteRaceId(athleteRaceId: string): Promise<number> {
    const result = await this.db
      .deleteFrom('race_predictions')
      .where('athlete_race_id', '=', athleteRaceId)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
