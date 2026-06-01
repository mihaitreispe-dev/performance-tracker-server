import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum WorkoutDifficulty {
  EASY = 'easy',
  MODERATE = 'moderate',
  HARD = 'hard',
  EXTREME = 'extreme',
}

export enum WorkoutType {
  STRENGTH = 'strength',
  CARDIO = 'cardio',
  FLEXIBILITY = 'flexibility',
  HIIT = 'hiit',
  CIRCUIT = 'circuit',
  CUSTOM = 'custom',
  RUN = 'run',
  CYCLING = 'cycling',
  SWIMMING = 'swimming',
  WALKING = 'walking',
}

/**
 * Workout visibility — composed with the caller's role + user_id to
 * decide list-endpoint and read-by-id authority.
 *
 *   personal     — only the creator + org admins/owners can see.
 *                  Default for any row predating this column.
 *   org_library  — visible to every member of the org. Setting this
 *                  value is gated to coach/admin/owner in the
 *                  service layer; athletes can publish only personal
 *                  workouts.
 */
export enum WorkoutVisibility {
  PERSONAL = 'personal',
  ORG_LIBRARY = 'org_library',
}

export interface WorkoutsTable {
  id: Generated<string>;
  organisation_id: string;
  name: string;
  description: string | null;
  difficulty: WorkoutDifficulty;
  type: WorkoutType;
  user_id: string;
  cardio_category_id: string | null;
  /**
   * ColumnType makes the SELECT shape required (every row has a
   * value thanks to the DB DEFAULT) but the INSERT shape optional —
   * callers that don't care (workout generator, file imports, the
   * duplicate-from-source path) get the 'personal' default for free,
   * while the explicit create path can still pass an org_library
   * value after the role-gated resolveVisibilityForWrite().
   */
  visibility: ColumnType<WorkoutVisibility, WorkoutVisibility | undefined, WorkoutVisibility>;
  /**
   * Audit link back to the onboarding response that produced this workout via the
   * Phase 3 generator. Null for hand-authored workouts.
   */
  generated_from_response_id: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type Workout = Selectable<WorkoutsTable>;
export type NewWorkout = Insertable<WorkoutsTable>;
export type WorkoutUpdate = Updateable<WorkoutsTable>;
