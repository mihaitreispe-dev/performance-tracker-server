import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum ExerciseInstanceIntensity {
  LOW = 'low',
  MODERATE = 'moderate',
  HIGH = 'high',
  MAX = 'max',
}

export enum ExerciseInstanceTempo {
  SLOW = 'slow',
  MODERATE = 'moderate',
  FAST = 'fast',
  EXPLOSIVE = 'explosive',
}

export enum ExerciseInstanceMode {
  REPS = 'reps',
  TIME = 'time',
}

export interface ExerciseInstancesTable {
  id: Generated<string>;
  exercise_id: string;
  mode: ExerciseInstanceMode;
  sets: number;
  reps: number | null;
  execution_time: number | null;
  load: string | null;
  intensity: ExerciseInstanceIntensity | null;
  tempo: ExerciseInstanceTempo | null;
  notes: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type ExerciseInstance = Selectable<ExerciseInstancesTable>;
export type NewExerciseInstance = Insertable<ExerciseInstancesTable>;
export type ExerciseInstanceUpdate = Updateable<ExerciseInstancesTable>;
