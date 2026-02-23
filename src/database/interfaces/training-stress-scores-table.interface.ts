import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export interface TrainingStressMetadata {
  hrZonesUsed?: boolean;
  powerUsed?: boolean;
  paceUsed?: boolean;
  averageHR?: number;
  maxHR?: number;
  hrReservePercent?: number;
  peakPower?: number;
  durationSeconds?: number;
  algorithm?: string;
  notes?: string;
}

export interface TrainingStressScoresTable {
  id: ColumnType<string, string | undefined, never>;
  workout_execution_id: string;
  tss: ColumnType<string | null, string | number | null, string | number | null>; // Training Stress Score
  trimp: ColumnType<string | null, string | number | null, string | number | null>; // Training Impulse
  aerobic_te: ColumnType<string | null, string | number | null, string | number | null>; // Aerobic Training Effect (0.0-5.0)
  anaerobic_te: ColumnType<string | null, string | number | null, string | number | null>; // Anaerobic Training Effect (0.0-5.0)
  estimated_recovery_hours: ColumnType<string | null, string | number | null, string | number | null>;
  intensity_factor: ColumnType<string | null, string | number | null, string | number | null>;
  normalized_power: ColumnType<string | null, string | number | null, string | number | null>; // For cycling
  normalized_pace: ColumnType<string | null, string | number | null, string | number | null>; // For running (min/km)
  hrss: ColumnType<string | null, string | number | null, string | number | null>; // Heart Rate Stress Score
  metadata: ColumnType<TrainingStressMetadata | null, TrainingStressMetadata | null, TrainingStressMetadata | null>;
  calculated_at: ColumnType<Date, Date | string, Date | string>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type TrainingStressScore = Selectable<TrainingStressScoresTable>;
export type NewTrainingStressScore = Insertable<TrainingStressScoresTable>;
export type UpdateTrainingStressScore = Updateable<TrainingStressScoresTable>;
