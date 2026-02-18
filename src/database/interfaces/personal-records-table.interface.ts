import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export enum PersonalRecordType {
  MAX_WEIGHT = 'max_weight',
  MAX_REPS = 'max_reps',
  MAX_VOLUME_SET = 'max_volume_set',
  FASTEST_1K = 'fastest_1k',
  FASTEST_5K = 'fastest_5k',
  FASTEST_10K = 'fastest_10k',
  FASTEST_HALF_MARATHON = 'fastest_half_marathon',
  FASTEST_MARATHON = 'fastest_marathon',
  FASTEST_KM_SPLIT = 'fastest_km_split',
  FASTEST_MILE_SPLIT = 'fastest_mile_split',
  LONGEST_DISTANCE = 'longest_distance',
  MAX_ELEVATION_GAIN = 'max_elevation_gain',
  LONGEST_DURATION = 'longest_duration',
}

export interface PersonalRecordsTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;
  record_type: PersonalRecordType;
  exercise_id: string | null;
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
