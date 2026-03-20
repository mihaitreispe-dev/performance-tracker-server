import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export const FitnessMetricType = {
  VO2_MAX: 'vo2_max',
  VO2_MAX_RUNNING: 'vo2_max_running', // VO2max for running
  VO2_MAX_CYCLING: 'vo2_max_cycling', // VO2max for cycling
  LTHR: 'lthr', // Lactate Threshold Heart Rate (general)
  LTHR_RUNNING: 'lthr_running', // LTHR for running
  LTHR_CYCLING: 'lthr_cycling', // LTHR for cycling
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
  // LTHR-specific metadata
  peak20?: number;
  peak60?: number;
  hrmcValue?: number;
  hrmcWindowMinutes?: number;
  // VO2max-specific metadata
  sport?: 'running' | 'cycling' | 'general';
  segmentsUsed?: number;
  lookbackDays?: number;
  ewmaApplied?: boolean;
  confidenceInterval?: { lower: number; upper: number };
  previousEstimate?: number;
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
