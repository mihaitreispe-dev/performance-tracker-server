import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum WorkoutPlanGoal {
  // Strength & Muscle
  BUILD_MUSCLE = 'build_muscle',
  INCREASE_STRENGTH = 'increase_strength',
  HYPERTROPHY = 'hypertrophy',
  POWERLIFTING = 'powerlifting',
  BODYBUILDING = 'bodybuilding',
  // Body Composition
  LOSE_WEIGHT = 'lose_weight',
  LOSE_FAT = 'lose_fat',
  BODY_RECOMPOSITION = 'body_recomposition',
  LEAN_BULK = 'lean_bulk',
  CUTTING = 'cutting',
  // Cardio & Endurance
  IMPROVE_ENDURANCE = 'improve_endurance',
  CARDIOVASCULAR_HEALTH = 'cardiovascular_health',
  MARATHON_TRAINING = 'marathon_training',
  HIIT_CONDITIONING = 'hiit_conditioning',
  FIVE_K_TEN_K_TRAINING = '5k_10k_training',
  // Flexibility & Mobility
  IMPROVE_FLEXIBILITY = 'improve_flexibility',
  IMPROVE_MOBILITY = 'improve_mobility',
  // Athletic & Sport
  PREPARE_COMPETITION = 'prepare_competition',
  SPORT_SPECIFIC = 'sport_specific',
  ATHLETIC_PERFORMANCE = 'athletic_performance',
  FUNCTIONAL_FITNESS = 'functional_fitness',
  CROSSFIT = 'crossfit',
  // Recovery & Health
  REHABILITATION = 'rehabilitation',
  INJURY_PREVENTION = 'injury_prevention',
  ACTIVE_RECOVERY = 'active_recovery',
  POSTURE_IMPROVEMENT = 'posture_improvement',
  // General
  GENERAL_FITNESS = 'general_fitness',
  MAINTAIN_FITNESS = 'maintain_fitness',
  STRESS_RELIEF = 'stress_relief',
  BEGINNER_FITNESS = 'beginner_fitness',
}

export interface WorkoutPlansTable {
  id: Generated<string>;
  user_id: string;
  name: string;
  description: string | null;
  goal: WorkoutPlanGoal | null;
  duration_weeks: number;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type WorkoutPlan = Selectable<WorkoutPlansTable>;
export type NewWorkoutPlan = Insertable<WorkoutPlansTable>;
export type WorkoutPlanUpdate = Updateable<WorkoutPlansTable>;
