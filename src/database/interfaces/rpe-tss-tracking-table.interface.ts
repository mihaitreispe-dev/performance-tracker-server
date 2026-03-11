import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface RpeTssTrackingTable {
  id: Generated<string>;
  user_id: string;
  workout_execution_id: string;
  session_rpe: number;
  srpe_tss: string; // NUMERIC stored as string
  calculated_tss: string | null; // NUMERIC stored as string
  rpe_tss_ratio: string | null; // NUMERIC stored as string
  accumulated_fatigue_flag: Generated<boolean>;
  created_at: Generated<Timestamp>;
}

export type RpeTssTracking = Selectable<RpeTssTrackingTable>;
export type NewRpeTssTracking = Insertable<RpeTssTrackingTable>;
export type RpeTssTrackingUpdate = Updateable<RpeTssTrackingTable>;
