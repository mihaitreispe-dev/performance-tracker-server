import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';
import { WorkoutType } from './workouts-table.interface';

export enum PersonalRecordType {
  // Strength PRs
  MAX_WEIGHT = 'max_weight',
  MAX_REPS = 'max_reps',
  MAX_VOLUME_SET = 'max_volume_set',

  // Running distances
  FASTEST_1K = 'fastest_1k',
  FASTEST_5K = 'fastest_5k',
  FASTEST_10K = 'fastest_10k',
  FASTEST_HALF_MARATHON = 'fastest_half_marathon',
  FASTEST_MARATHON = 'fastest_marathon',

  // Swimming distances
  FASTEST_400M = 'fastest_400m',
  FASTEST_800M = 'fastest_800m',
  FASTEST_1500M = 'fastest_1500m',
  FASTEST_1900M = 'fastest_1900m', // Half Ironman swim

  // Cycling distances
  FASTEST_20K = 'fastest_20k',
  FASTEST_40K = 'fastest_40k',
  FASTEST_90K = 'fastest_90k', // Half Ironman bike
  FASTEST_100K = 'fastest_100k',
  FASTEST_180K = 'fastest_180k', // Ironman bike

  // General cardio PRs
  LONGEST_DISTANCE = 'longest_distance',
  LONGEST_DURATION = 'longest_duration',

  // Deprecated - kept for backward compatibility but no longer detected
  FASTEST_KM_SPLIT = 'fastest_km_split',
  FASTEST_MILE_SPLIT = 'fastest_mile_split',
  MAX_ELEVATION_GAIN = 'max_elevation_gain',
}

export interface PersonalRecordsTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;
  record_type: PersonalRecordType;
  exercise_id: string | null;
  workout_type: WorkoutType | null;
  value: ColumnType<string, string | number, string | number>;
  unit: string;
  workout_execution_id: string;
  achieved_at: ColumnType<Date, Date | string, Date | string>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type PersonalRecord = Selectable<PersonalRecordsTable>;
export type NewPersonalRecord = Insertable<PersonalRecordsTable>;
export type UpdatePersonalRecord = Updateable<PersonalRecordsTable>;
