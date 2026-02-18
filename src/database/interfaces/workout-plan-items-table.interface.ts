import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface WorkoutPlanItemsTable {
  id: Generated<string>;
  workout_plan_id: string;
  workout_id: string;
  week_number: number;
  day_of_week: number;
  created_at: Generated<Timestamp>;
}

export type WorkoutPlanItem = Selectable<WorkoutPlanItemsTable>;
export type NewWorkoutPlanItem = Insertable<WorkoutPlanItemsTable>;
export type WorkoutPlanItemUpdate = Updateable<WorkoutPlanItemsTable>;
