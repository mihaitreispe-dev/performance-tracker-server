import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface CoachAssignedWorkoutsTable {
  id: Generated<string>;
  coach_id: string;
  athlete_id: string;
  workout_id: string;
  notes: string | null;
  assigned_at: Generated<Timestamp>;
}

export type CoachAssignedWorkout = Selectable<CoachAssignedWorkoutsTable>;
export type NewCoachAssignedWorkout = Insertable<CoachAssignedWorkoutsTable>;
export type CoachAssignedWorkoutUpdate = Updateable<CoachAssignedWorkoutsTable>;
