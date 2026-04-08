import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export const Gender = {
  MALE: 'male',
  FEMALE: 'female',
  OTHER: 'other',
} as const;

export type Gender = (typeof Gender)[keyof typeof Gender];

export const VdotSource = {
  CALCULATED: 'calculated',
  RACE_RESULT: 'race_result',
  MANUAL: 'manual',
} as const;

export type VdotSource = (typeof VdotSource)[keyof typeof VdotSource];

export const GiSensitivity = {
  LOW: 'low',
  MODERATE: 'moderate',
  HIGH: 'high',
} as const;

export type GiSensitivity = (typeof GiSensitivity)[keyof typeof GiSensitivity];

export const CaffeineTolerance = {
  NONE: 'none',
  LOW: 'low',
  MODERATE: 'moderate',
  HIGH: 'high',
} as const;

export type CaffeineTolerance = (typeof CaffeineTolerance)[keyof typeof CaffeineTolerance];

export const CarbSource = {
  GELS: 'gels',
  DRINKS: 'drinks',
  CHEWS: 'chews',
  REAL_FOOD: 'real_food',
} as const;

export type CarbSource = (typeof CarbSource)[keyof typeof CarbSource];

export interface AthleteProfileMetricsTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;
  birth_date: ColumnType<Date | null, Date | string | null, Date | string | null>;
  gender: ColumnType<string | null, string | null, string | null>;
  weight_kg: ColumnType<string | null, string | number | null, string | number | null>;
  height_cm: ColumnType<string | null, string | number | null, string | number | null>;
  current_vdot: ColumnType<string | null, string | number | null, string | number | null>;
  vdot_source: ColumnType<string | null, string | null, string | null>;
  vdot_calculated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  years_training: ColumnType<number | null, number | null, number | null>;
  weekly_volume_hours: ColumnType<string | null, string | number | null, string | number | null>;
  // Nutrition preferences
  sweat_rate_ml_per_hour: ColumnType<string | null, string | number | null, string | number | null>;
  gi_sensitivity: ColumnType<string | null, string | null, string | null>;
  preferred_carb_sources: ColumnType<string[] | null, string[] | null, string[] | null>;
  caffeine_tolerance: ColumnType<string | null, string | null, string | null>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type AthleteProfileMetrics = Selectable<AthleteProfileMetricsTable>;
export type NewAthleteProfileMetrics = Insertable<AthleteProfileMetricsTable>;
export type UpdateAthleteProfileMetrics = Updateable<AthleteProfileMetricsTable>;
