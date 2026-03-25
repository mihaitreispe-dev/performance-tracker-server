import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewWeatherForecast, UpdateWeatherForecast, WeatherForecast } from 'src/database/interfaces';

@Injectable()
export class WeatherForecastRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<WeatherForecast | undefined> {
    return this.db.selectFrom('weather_forecasts').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findByAthleteRaceId(athleteRaceId: string): Promise<WeatherForecast | undefined> {
    return this.db
      .selectFrom('weather_forecasts')
      .selectAll()
      .where('athlete_race_id', '=', athleteRaceId)
      .orderBy('forecast_date', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  async findRecentByAthleteRaceId(athleteRaceId: string, since: Date): Promise<WeatherForecast | undefined> {
    return this.db
      .selectFrom('weather_forecasts')
      .selectAll()
      .where('athlete_race_id', '=', athleteRaceId)
      .where('forecast_date', '>=', since)
      .orderBy('forecast_date', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  async findAllForRace(athleteRaceId: string): Promise<WeatherForecast[]> {
    return this.db
      .selectFrom('weather_forecasts')
      .selectAll()
      .where('athlete_race_id', '=', athleteRaceId)
      .orderBy('forecast_date', 'desc')
      .execute();
  }

  async create(data: NewWeatherForecast): Promise<WeatherForecast> {
    return this.db.insertInto('weather_forecasts').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async update(id: string, data: UpdateWeatherForecast): Promise<WeatherForecast | undefined> {
    return this.db
      .updateTable('weather_forecasts')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('weather_forecasts').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async deleteByAthleteRaceId(athleteRaceId: string): Promise<number> {
    const result = await this.db
      .deleteFrom('weather_forecasts')
      .where('athlete_race_id', '=', athleteRaceId)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  async findStaleForecasts(cutoffDate: Date): Promise<WeatherForecast[]> {
    return this.db
      .selectFrom('weather_forecasts')
      .selectAll()
      .where('forecast_date', '<', cutoffDate)
      .execute();
  }
}
