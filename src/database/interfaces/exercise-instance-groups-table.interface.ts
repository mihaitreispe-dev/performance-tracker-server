import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface ExerciseInstanceGroupsTable {
  id: Generated<string>;
  repeat: Generated<number>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type ExerciseInstanceGroup = Selectable<ExerciseInstanceGroupsTable>;
export type NewExerciseInstanceGroup = Insertable<ExerciseInstanceGroupsTable>;
export type ExerciseInstanceGroupUpdate = Updateable<ExerciseInstanceGroupsTable>;
