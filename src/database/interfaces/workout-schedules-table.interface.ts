import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface WorkoutSchedulesTable {
  id: Generated<string>;
  organisation_id: string;
  user_id: string;
  workout_id: string;
  scheduled_date: Date;
  completed_at: Timestamp | null;
  workout_plan_id: string | null;
  coach_notes: string | null;
  created_by_coach_id: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type WorkoutSchedule = Selectable<WorkoutSchedulesTable>;
export type NewWorkoutSchedule = Insertable<WorkoutSchedulesTable>;
export type WorkoutScheduleUpdate = Updateable<WorkoutSchedulesTable>;
