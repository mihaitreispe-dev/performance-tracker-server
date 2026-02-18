import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export interface DailyTrainingLoadsTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;
  date: ColumnType<Date, Date | string, Date | string>;
  daily_load: ColumnType<string, string | number, string | number>;
  acute_load: ColumnType<string, string | number, string | number>;
  chronic_load: ColumnType<string, string | number, string | number>;
  acwr: ColumnType<string | null, string | number | null, string | number | null>;
  fatigue_score: ColumnType<string | null, string | number | null, string | number | null>;
  fitness_score: ColumnType<string | null, string | number | null, string | number | null>;
  form_score: ColumnType<string | null, string | number | null, string | number | null>;
  hr_load_contribution: ColumnType<string | null, string | number | null, string | number | null>;
  duration_load_contribution: ColumnType<string | null, string | number | null, string | number | null>;
  volume_load_contribution: ColumnType<string | null, string | number | null, string | number | null>;
  workout_count: ColumnType<number, number | undefined, number>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type DailyTrainingLoad = Selectable<DailyTrainingLoadsTable>;
export type NewDailyTrainingLoad = Insertable<DailyTrainingLoadsTable>;
export type UpdateDailyTrainingLoad = Updateable<DailyTrainingLoadsTable>;
