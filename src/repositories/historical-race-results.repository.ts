import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  HistoricalRaceResult,
  NewHistoricalRaceResult,
  RaceSport,
  UpdateHistoricalRaceResult,
} from 'src/database/interfaces';

interface FindManyFilter {
  userId: string;
  sport?: RaceSport;
  distanceMeters?: number;
  distanceRange?: { min: number; max: number };
  dateFrom?: Date;
  dateTo?: Date;
}

interface FindManyOptions {
  filter: FindManyFilter;
  sort?: { field: 'race_date' | 'finish_time_seconds'; direction: 'asc' | 'desc' }[];
  limit?: number;
}

@Injectable()
export class HistoricalRaceResultsRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<HistoricalRaceResult | undefined> {
    return this.db.selectFrom('historical_race_results').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findMany(options: FindManyOptions): Promise<HistoricalRaceResult[]> {
    let query = this.db
      .selectFrom('historical_race_results')
      .selectAll()
      .where('user_id', '=', options.filter.userId);

    if (options.filter.sport) {
      query = query.where('sport', '=', options.filter.sport);
    }

    if (options.filter.distanceMeters) {
      query = query.where('distance_meters', '=', options.filter.distanceMeters);
    }

    if (options.filter.distanceRange) {
      query = query
        .where('distance_meters', '>=', options.filter.distanceRange.min)
        .where('distance_meters', '<=', options.filter.distanceRange.max);
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
      query = query.orderBy('race_date', 'desc');
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    return query.execute();
  }

  async findByAthleteRaceId(athleteRaceId: string): Promise<HistoricalRaceResult | undefined> {
    return this.db
      .selectFrom('historical_race_results')
      .selectAll()
      .where('athlete_race_id', '=', athleteRaceId)
      .executeTakeFirst();
  }

  async findBestForDistance(
    userId: string,
    sport: RaceSport,
    distanceMeters: number,
    tolerance: number = 0.05, // 5% tolerance for similar distances
  ): Promise<HistoricalRaceResult | undefined> {
    const minDistance = Math.floor(distanceMeters * (1 - tolerance));
    const maxDistance = Math.ceil(distanceMeters * (1 + tolerance));

    return this.db
      .selectFrom('historical_race_results')
      .selectAll()
      .where('user_id', '=', userId)
      .where('sport', '=', sport)
      .where('distance_meters', '>=', minDistance)
      .where('distance_meters', '<=', maxDistance)
      .orderBy('finish_time_seconds', 'asc')
      .limit(1)
      .executeTakeFirst();
  }

  async findRecentForSport(userId: string, sport: RaceSport, days: number = 365): Promise<HistoricalRaceResult[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return this.db
      .selectFrom('historical_race_results')
      .selectAll()
      .where('user_id', '=', userId)
      .where('sport', '=', sport)
      .where('race_date', '>=', cutoffDate)
      .orderBy('race_date', 'desc')
      .execute();
  }

  async getPredictionAccuracyStats(userId: string): Promise<{
    totalWithPredictions: number;
    averageErrorPercent: number;
    averageErrorSeconds: number;
  }> {
    const result = await this.db
      .selectFrom('historical_race_results')
      .select([
        (eb) => eb.fn.countAll<number>().as('total'),
        (eb) => sql<number>`AVG(ABS(prediction_error_percent))`.as('avg_error_percent'),
        (eb) => sql<number>`AVG(ABS(prediction_error_seconds))`.as('avg_error_seconds'),
      ])
      .where('user_id', '=', userId)
      .where('predicted_time_seconds', 'is not', null)
      .executeTakeFirst();

    return {
      totalWithPredictions: Number(result?.total ?? 0),
      averageErrorPercent: Number(result?.avg_error_percent ?? 0),
      averageErrorSeconds: Number(result?.avg_error_seconds ?? 0),
    };
  }

  async create(data: NewHistoricalRaceResult): Promise<HistoricalRaceResult> {
    return this.db.insertInto('historical_race_results').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async update(id: string, data: UpdateHistoricalRaceResult): Promise<HistoricalRaceResult | undefined> {
    return this.db
      .updateTable('historical_race_results')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('historical_race_results').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
