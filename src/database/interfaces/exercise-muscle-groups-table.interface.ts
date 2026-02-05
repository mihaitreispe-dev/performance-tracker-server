import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface ExerciseMuscleGroupsTable {
  id: Generated<string>;
  exercise_id: string;
  muscle_group_id: string;
  is_primary: boolean;
  created_at: Generated<Timestamp>;
}

export type ExerciseMuscleGroup = Selectable<ExerciseMuscleGroupsTable>;
export type NewExerciseMuscleGroup = Insertable<ExerciseMuscleGroupsTable>;
export type ExerciseMuscleGroupUpdate = Updateable<ExerciseMuscleGroupsTable>;
