import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface ExerciseEquipmentTable {
  id: Generated<string>;
  exercise_id: string;
  equipment_id: string;
  created_at: Generated<Timestamp>;
}

export type ExerciseEquipment = Selectable<ExerciseEquipmentTable>;
export type NewExerciseEquipment = Insertable<ExerciseEquipmentTable>;
export type ExerciseEquipmentUpdate = Updateable<ExerciseEquipmentTable>;
