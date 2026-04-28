import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export const RaceResultSource = {
  GARMIN: 'garmin',
  MANUAL: 'manual',
} as const;

export type RaceResultSource = (typeof RaceResultSource)[keyof typeof RaceResultSource];

export interface HistoricalRaceResultsTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;
  athlete_race_id: ColumnType<string | null, string | null, string | null>;
  race_name: string;
  race_date: ColumnType<Date, Date | string, Date | string>;
  sport: string;
  distance_meters: ColumnType<number, number, number>;
  finish_time_seconds: ColumnType<number, number, number>;
  official_result: ColumnType<boolean, boolean | undefined, boolean>;
  temperature_celsius: ColumnType<number | null, number | null, number | null>;
  humidity_percent: ColumnType<number | null, number | null, number | null>;
  course_elevation_meters: ColumnType<number | null, number | null, number | null>;
  predicted_time_seconds: ColumnType<number | null, number | null, number | null>;
  prediction_error_seconds: ColumnType<number | null, number | null, number | null>;
  prediction_error_percent: ColumnType<string | null, string | number | null, string | number | null>;
  source: string;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type HistoricalRaceResult = Selectable<HistoricalRaceResultsTable>;
export type NewHistoricalRaceResult = Insertable<HistoricalRaceResultsTable>;
export type UpdateHistoricalRaceResult = Updateable<HistoricalRaceResultsTable>;
