import { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface ExerciseImagesTable {
  id: Generated<string>;
  exercise_id: string;
  s3_bucket: string;
  s3_key: string;
  position: Generated<number>;
  created_at: Generated<Date>;
}

export type ExerciseImage = Selectable<ExerciseImagesTable>;
export type NewExerciseImage = Insertable<ExerciseImagesTable>;
export type ExerciseImageUpdate = Updateable<ExerciseImagesTable>;
