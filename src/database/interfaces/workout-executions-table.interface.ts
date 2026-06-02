import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum WorkoutExecutionSource {
  MANUAL = 'manual',
  GARMIN = 'garmin',
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
  /**
   * True when the user ended early or skipped one or more exercises
   * (spec B7). Display annotation — not a filter primary. Defaults
   * to false on insert and is set via the same `finishWorkout` /
   * `update` round-trip that writes `completed_at`. Once true,
   * stays true (a partial-then-finished workout doesn't retroactively
   * become "complete").
   */
  partial: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type WorkoutExecution = Selectable<WorkoutExecutionsTable>;
export type NewWorkoutExecution = Insertable<WorkoutExecutionsTable>;
export type WorkoutExecutionUpdate = Updateable<WorkoutExecutionsTable>;
