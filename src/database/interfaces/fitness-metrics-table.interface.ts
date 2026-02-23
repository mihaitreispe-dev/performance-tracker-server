import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export const FitnessMetricType = {
  VO2_MAX: 'vo2_max',
  LTHR: 'lthr', // Lactate Threshold Heart Rate
  LTP: 'ltp', // Lactate Threshold Pace
  FTP: 'ftp', // Functional Threshold Power
  RHR: 'rhr', // Resting Heart Rate
  MAX_HR: 'max_hr',
} as const;

export type FitnessMetricType = (typeof FitnessMetricType)[keyof typeof FitnessMetricType];

export interface FitnessMetricMetadata {
  dataPointsUsed?: number;
  rSquared?: number;
  algorithm?: string;
  sourceType?: 'calculated' | 'manual' | 'imported';
  notes?: string;
}

export interface FitnessMetricsTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;
  metric_type: string;
  value: ColumnType<string, string | number, string | number>;
  confidence: ColumnType<string | null, string | number | null, string | number | null>;
  source_workout_id: ColumnType<string | null, string | null, string | null>;
  metadata: ColumnType<FitnessMetricMetadata | null, FitnessMetricMetadata | null, FitnessMetricMetadata | null>;
  calculated_at: ColumnType<Date, Date | string, Date | string>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type FitnessMetric = Selectable<FitnessMetricsTable>;
export type NewFitnessMetric = Insertable<FitnessMetricsTable>;
export type UpdateFitnessMetric = Updateable<FitnessMetricsTable>;
