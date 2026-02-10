import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface WorkoutItemsTable {
  id: Generated<string>;
  workout_id: string;
  exercise_instance_id: string | null;
  exercise_instance_group_id: string | null;
  cardio_step_id: string | null;
  cardio_step_group_id: string | null;
  position: number;
  created_at: Generated<Timestamp>;
}

export type WorkoutItem = Selectable<WorkoutItemsTable>;
export type NewWorkoutItem = Insertable<WorkoutItemsTable>;
export type WorkoutItemUpdate = Updateable<WorkoutItemsTable>;
