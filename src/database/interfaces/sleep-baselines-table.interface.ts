import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface SleepBaselinesTable {
  id: Generated<string>;
  user_id: string;
  date: Date;

  // TST (Total Sleep Time) baselines - in seconds
  tst_14day_avg: number | null;
  tst_14day_std: number | null;

  // SE (Sleep Efficiency) baselines - 0.0-1.0
  se_14day_avg: string | null; // Stored as decimal
  se_14day_std: string | null;

  // HRV during sleep baselines
  sleep_hrv_14day_avg: string | null;
  sleep_hrv_14day_std: string | null;

  // HR nadir baselines
  hr_nadir_14day_avg: string | null;
  hr_nadir_14day_std: string | null;

  // Sleep debt tracking (cumulative deviation from optimal, negative = deficit)
  sleep_debt_7day: number | null; // seconds
  sleep_debt_14day: number | null; // seconds

  data_points_count: number;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type SleepBaseline = Selectable<SleepBaselinesTable>;
export type NewSleepBaseline = Insertable<SleepBaselinesTable>;
export type SleepBaselineUpdate = Updateable<SleepBaselinesTable>;
