import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/** Many-to-many join: an exercise belongs to zero or more categories. */
export interface ExerciseCategoriesTable {
  id: Generated<string>;
  exercise_id: string;
  category_id: string;
  created_at: Generated<Timestamp>;
}

export type ExerciseCategory = Selectable<ExerciseCategoriesTable>;
export type NewExerciseCategory = Insertable<ExerciseCategoriesTable>;
export type ExerciseCategoryUpdate = Updateable<ExerciseCategoriesTable>;
