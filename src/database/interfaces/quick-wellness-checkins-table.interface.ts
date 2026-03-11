import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum WellnessCheckinSource {
  MANUAL = 'manual',
  NOTIFICATION = 'notification',
  SCHEDULED = 'scheduled',
}

export interface QuickWellnessCheckinsTable {
  id: Generated<string>;
  user_id: string;
  checkin_date: Date | string;
  sleep_quality: number | null; // 1-5 scale
  energy_level: number | null; // 1-5 scale
  muscle_soreness: number | null; // 1-5 scale (inverted: 5 = no soreness)
  stress_level: number | null; // 1-5 scale (inverted: 5 = no stress)
  training_readiness: number | null; // 1-5 scale
  completion_seconds: number | null; // Track time to complete
  source: Generated<WellnessCheckinSource>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type QuickWellnessCheckin = Selectable<QuickWellnessCheckinsTable>;
export type NewQuickWellnessCheckin = Insertable<QuickWellnessCheckinsTable>;
export type QuickWellnessCheckinUpdate = Updateable<QuickWellnessCheckinsTable>;
