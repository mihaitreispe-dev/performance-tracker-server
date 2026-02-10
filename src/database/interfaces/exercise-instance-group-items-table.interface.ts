import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface ExerciseInstanceGroupItemsTable {
  id: Generated<string>;
  group_id: string;
  exercise_instance_id: string;
  position: number;
  created_at: Generated<Timestamp>;
}

export type ExerciseInstanceGroupItem = Selectable<ExerciseInstanceGroupItemsTable>;
export type NewExerciseInstanceGroupItem = Insertable<ExerciseInstanceGroupItemsTable>;
export type ExerciseInstanceGroupItemUpdate = Updateable<ExerciseInstanceGroupItemsTable>;
