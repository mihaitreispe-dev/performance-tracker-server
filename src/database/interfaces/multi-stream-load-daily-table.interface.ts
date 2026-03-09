import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export interface MultiStreamLoadDailyMetadata {
  workoutIds?: string[];
  aerobicBreakdown?: { workoutId: string; load: number; sport: string }[];
  mskBreakdown?: { workoutId: string; load: number; sport: string }[];
  neuralBreakdown?: { workoutId: string; load: number; sport: string }[];
  notes?: string;
}

export type LimitingStream = 'aerobic' | 'msk' | 'neural' | null;

export interface MultiStreamLoadDailyTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;
  date: ColumnType<Date, Date | string, Date | string>;

  // Aerobic stream (7/42-day time constants)
  aerobic_ctl: ColumnType<string | null, string | number | null, string | number | null>;
  aerobic_atl: ColumnType<string | null, string | number | null, string | number | null>;
  aerobic_tsb: ColumnType<string | null, string | number | null, string | number | null>;
  aerobic_daily_load: ColumnType<string | null, string | number | null, string | number | null>;

  // Musculoskeletal stream (5/21-day time constants)
  msk_ctl: ColumnType<string | null, string | number | null, string | number | null>;
  msk_atl: ColumnType<string | null, string | number | null, string | number | null>;
  msk_tsb: ColumnType<string | null, string | number | null, string | number | null>;
  msk_daily_load: ColumnType<string | null, string | number | null, string | number | null>;

  // Neural/CNS stream (3/10-day time constants)
  neural_ctl: ColumnType<string | null, string | number | null, string | number | null>;
  neural_atl: ColumnType<string | null, string | number | null, string | number | null>;
  neural_tsb: ColumnType<string | null, string | number | null, string | number | null>;
  neural_daily_load: ColumnType<string | null, string | number | null, string | number | null>;

  // Composite readiness
  readiness_score: ColumnType<string | null, string | number | null, string | number | null>;
  readiness_override_reason: ColumnType<string | null, string | null, string | null>;
  limiting_stream: ColumnType<LimitingStream, LimitingStream, LimitingStream>;

  metadata: ColumnType<
    MultiStreamLoadDailyMetadata | null,
    MultiStreamLoadDailyMetadata | null,
    MultiStreamLoadDailyMetadata | null
  >;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type MultiStreamLoadDaily = Selectable<MultiStreamLoadDailyTable>;
export type NewMultiStreamLoadDaily = Insertable<MultiStreamLoadDailyTable>;
export type UpdateMultiStreamLoadDaily = Updateable<MultiStreamLoadDailyTable>;

// Stream types for type-safe operations
export const StreamType = {
  AEROBIC: 'aerobic',
  MSK: 'msk',
  NEURAL: 'neural',
} as const;

export type StreamType = (typeof StreamType)[keyof typeof StreamType];
