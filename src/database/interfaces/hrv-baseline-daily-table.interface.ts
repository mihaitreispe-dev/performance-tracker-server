import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export type SuppressionSeverity = 'mild' | 'moderate' | 'severe' | null;

export interface HrvBaselineDailyMetadata {
  dataSource?: string;
  hrvMeasurementCount?: number;
  hrvValues?: number[];
  notes?: string;
}

export interface HrvBaselineDailyTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;
  date: ColumnType<Date, Date | string, Date | string>;

  // Current day values
  hrv_value: ColumnType<string | null, string | number | null, string | number | null>;
  resting_hr: ColumnType<string | null, string | number | null, string | number | null>;

  // 7-day rolling stats
  hrv_7day_avg: ColumnType<string | null, string | number | null, string | number | null>;
  hrv_7day_std: ColumnType<string | null, string | number | null, string | number | null>;
  hrv_zscore: ColumnType<string | null, string | number | null, string | number | null>;

  // Suppression detection
  is_suppressed: ColumnType<boolean, boolean | undefined, boolean>;
  suppression_severity: ColumnType<SuppressionSeverity, SuppressionSeverity, SuppressionSeverity>;

  metadata: ColumnType<
    HrvBaselineDailyMetadata | null,
    HrvBaselineDailyMetadata | null,
    HrvBaselineDailyMetadata | null
  >;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type HrvBaselineDaily = Selectable<HrvBaselineDailyTable>;
export type NewHrvBaselineDaily = Insertable<HrvBaselineDailyTable>;
export type UpdateHrvBaselineDaily = Updateable<HrvBaselineDailyTable>;

// Suppression thresholds
export const SuppressionThresholds = {
  MILD: -1.0, // z-score < -1.0
  MODERATE: -1.5, // z-score < -1.5
  SEVERE: -2.0, // z-score < -2.0
} as const;
