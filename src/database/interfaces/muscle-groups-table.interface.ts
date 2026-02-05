import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface MuscleGroupsTable {
  id: Generated<string>;
  name: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type MuscleGroup = Selectable<MuscleGroupsTable>;
export type NewMuscleGroup = Insertable<MuscleGroupsTable>;
export type MuscleGroupUpdate = Updateable<MuscleGroupsTable>;
