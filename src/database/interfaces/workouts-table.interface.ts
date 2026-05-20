import { Generated, Insertable, Selectable, Updateable } from 'kysely';

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
