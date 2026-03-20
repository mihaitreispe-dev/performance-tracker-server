import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * Valid sleep log sources
 */
export type SleepLogSource = 'manual' | 'garmin' | 'whoop' | 'apple_health' | 'oura';

export interface HrSample {
  timestampSeconds: number;
  heartRate: number;
}

/**
 * Breakdown of sleep score subscores
 */
export interface SleepScoreBreakdown {
  durationSubscore: number;
  efficiencySubscore: number;
  architectureSubscore: number;
  hrvSubscore: number;
  hrSubscore: number;
  sleepDebtPenalty: number;
  baselineBonus: number;
}

export interface SleepLogsTable {
  id: Generated<string>;
  user_id: string;
  log_date: Date;
  start_time: Timestamp | null;
  end_time: Timestamp | null;
  total_duration_seconds: number;
  awake_duration_seconds: Generated<number>;
  light_duration_seconds: Generated<number>;
  deep_duration_seconds: Generated<number>;
  rem_duration_seconds: Generated<number>;
  avg_resting_hr: number | null;
  avg_hrv: number | null;
  hr_samples: HrSample[] | null;
  source: Generated<string>;
  external_id: string | null;

  // Enhanced sleep metrics
  sleep_onset_latency_seconds: number | null;
  waso_seconds: number | null;
  waso_count: number | null;
  time_in_bed_seconds: number | null;
  hr_nadir: number | null;
  hr_nadir_timestamp: Timestamp | null;
  hrv_first_half_avg: string | null; // Stored as decimal
  hrv_second_half_avg: string | null;
  sleep_efficiency: string | null; // Stored as decimal
  computed_score: number | null;
  computed_score_breakdown: SleepScoreBreakdown | null;

  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type SleepLog = Selectable<SleepLogsTable>;
export type NewSleepLog = Insertable<SleepLogsTable>;
export type SleepLogUpdate = Updateable<SleepLogsTable>;
