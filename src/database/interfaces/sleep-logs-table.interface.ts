import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface HrSample {
  timestampSeconds: number;
  heartRate: number;
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
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type SleepLog = Selectable<SleepLogsTable>;
export type NewSleepLog = Insertable<SleepLogsTable>;
export type SleepLogUpdate = Updateable<SleepLogsTable>;
