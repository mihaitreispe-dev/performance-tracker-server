import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum WorkoutExecutionSource {
  MANUAL = 'manual',
  GARMIN = 'garmin',
  STRAVA = 'strava',
  APPLE_HEALTH = 'apple_health',
  FITBIT = 'fitbit',
  TRAININGPEAKS = 'trainingpeaks',
}

export interface WorkoutExecutionsTable {
  id: Generated<string>;
  user_id: string;
  workout_schedule_id: string | null;
  started_at: Timestamp;
  completed_at: Timestamp | null;
  duration_seconds: number | null;
  source: WorkoutExecutionSource;
  external_id: string | null;
  notes: string | null;
  session_rpe: number | null;
  srpe_tss: string | null; // NUMERIC stored as string
  rpe_collected_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type WorkoutExecution = Selectable<WorkoutExecutionsTable>;
export type NewWorkoutExecution = Insertable<WorkoutExecutionsTable>;
export type WorkoutExecutionUpdate = Updateable<WorkoutExecutionsTable>;
