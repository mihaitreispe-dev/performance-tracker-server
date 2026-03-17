import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';

import { Database } from 'src/database/interfaces/database.interface';
import {
  AthleteRace,
  NewAthleteRace,
  AthleteRaceUpdate,
} from 'src/database/interfaces/athlete-races-table.interface';
import { RaceEvent } from 'src/database/interfaces/race-events-table.interface';

export interface AthleteRaceWithEvent extends AthleteRace {
  race_event?: RaceEvent | null;
}

export interface AthleteRaceFindManyOptions {
  filter?: {
    userId?: string;
    upcoming?: boolean;
  };
  limit?: number;
  offset?: number;
}

@Injectable()
export class AthleteRaceRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<AthleteRace | undefined> {
    return this.db.selectFrom('athlete_races').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByIdWithEvent(id: string): Promise<AthleteRaceWithEvent | undefined> {
    const result = await this.db
      .selectFrom('athlete_races')
      .leftJoin('race_events', 'race_events.id', 'athlete_races.race_event_id')
      .where('athlete_races.id', '=', id)
      .select([
        'athlete_races.id',
        'athlete_races.user_id',
        'athlete_races.race_event_id',
        'athlete_races.manual_name',
        'athlete_races.manual_date',
        'athlete_races.manual_event_type',
        'athlete_races.manual_distance_meters',
        'athlete_races.goal_time_seconds',
        'athlete_races.priority',
        'athlete_races.course_file_path',
        'athlete_races.notes',
        'athlete_races.created_at',
        'athlete_races.updated_at',
        'race_events.id as re_id',
        'race_events.external_id as re_external_id',
        'race_events.source as re_source',
        'race_events.name as re_name',
        'race_events.description as re_description',
        'race_events.event_type as re_event_type',
        'race_events.date as re_date',
        'race_events.location_city as re_location_city',
        'race_events.location_country as re_location_country',
        'race_events.latitude as re_latitude',
        'race_events.longitude as re_longitude',
        'race_events.distance_meters as re_distance_meters',
        'race_events.elevation_gain_meters as re_elevation_gain_meters',
        'race_events.url as re_url',
        'race_events.cached_at as re_cached_at',
        'race_events.created_at as re_created_at',
        'race_events.updated_at as re_updated_at',
      ])
      .executeTakeFirst();

    if (!result) return undefined;

    return this.mapToAthleteRaceWithEvent(result);
  }

  async findManyByUserId(userId: string): Promise<AthleteRaceWithEvent[]> {
    const results = await this.db
      .selectFrom('athlete_races')
      .leftJoin('race_events', 'race_events.id', 'athlete_races.race_event_id')
      .where('athlete_races.user_id', '=', userId)
      .select([
        'athlete_races.id',
        'athlete_races.user_id',
        'athlete_races.race_event_id',
        'athlete_races.manual_name',
        'athlete_races.manual_date',
        'athlete_races.manual_event_type',
        'athlete_races.manual_distance_meters',
        'athlete_races.goal_time_seconds',
        'athlete_races.priority',
        'athlete_races.course_file_path',
        'athlete_races.notes',
        'athlete_races.created_at',
        'athlete_races.updated_at',
        'race_events.id as re_id',
        'race_events.external_id as re_external_id',
        'race_events.source as re_source',
        'race_events.name as re_name',
        'race_events.description as re_description',
        'race_events.event_type as re_event_type',
        'race_events.date as re_date',
        'race_events.location_city as re_location_city',
        'race_events.location_country as re_location_country',
        'race_events.latitude as re_latitude',
        'race_events.longitude as re_longitude',
        'race_events.distance_meters as re_distance_meters',
        'race_events.elevation_gain_meters as re_elevation_gain_meters',
        'race_events.url as re_url',
        'race_events.cached_at as re_cached_at',
        'race_events.created_at as re_created_at',
        'race_events.updated_at as re_updated_at',
      ])
      .orderBy('athlete_races.created_at', 'desc')
      .execute();

    return results.map((r) => this.mapToAthleteRaceWithEvent(r));
  }

  async create(data: NewAthleteRace): Promise<AthleteRace> {
    return this.db.insertInto('athlete_races').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: AthleteRaceUpdate): Promise<AthleteRace> {
    return this.db
      .updateTable('athlete_races')
      .set({ ...data, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('athlete_races').where('id', '=', id).execute();
  }

  private mapToAthleteRaceWithEvent(row: Record<string, unknown>): AthleteRaceWithEvent {
    const athleteRace: AthleteRaceWithEvent = {
      id: row.id as string,
      user_id: row.user_id as string,
      race_event_id: row.race_event_id as string | null,
      manual_name: row.manual_name as string | null,
      manual_date: row.manual_date as Date | null,
      manual_event_type: row.manual_event_type as AthleteRace['manual_event_type'],
      manual_distance_meters: row.manual_distance_meters as number | null,
      goal_time_seconds: row.goal_time_seconds as number | null,
      priority: row.priority as AthleteRace['priority'],
      course_file_path: row.course_file_path as string | null,
      notes: row.notes as string | null,
      created_at: row.created_at as Date,
      updated_at: row.updated_at as Date,
    };

    if (row.re_id) {
      athleteRace.race_event = {
        id: row.re_id as string,
        external_id: row.re_external_id as string | null,
        source: row.re_source as RaceEvent['source'],
        name: row.re_name as string,
        description: row.re_description as string | null,
        event_type: row.re_event_type as RaceEvent['event_type'],
        date: row.re_date as Date,
        location_city: row.re_location_city as string | null,
        location_country: row.re_location_country as string | null,
        latitude: row.re_latitude as number | null,
        longitude: row.re_longitude as number | null,
        distance_meters: row.re_distance_meters as number | null,
        elevation_gain_meters: row.re_elevation_gain_meters as number | null,
        url: row.re_url as string | null,
        cached_at: row.re_cached_at as Date,
        created_at: row.re_created_at as Date,
        updated_at: row.re_updated_at as Date,
      };
    }

    return athleteRace;
  }
}
