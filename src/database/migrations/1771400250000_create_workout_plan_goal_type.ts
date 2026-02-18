import { type Kysely } from 'kysely';

const typeName = 'workout_plan_goal';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createType(typeName)
    .asEnum([
      // Strength & Muscle
      'build_muscle',
      'increase_strength',
      'hypertrophy',
      'powerlifting',
      'bodybuilding',
      // Body Composition
      'lose_weight',
      'lose_fat',
      'body_recomposition',
      'lean_bulk',
      'cutting',
      // Cardio & Endurance
      'improve_endurance',
      'cardiovascular_health',
      'marathon_training',
      'hiit_conditioning',
      '5k_10k_training',
      // Flexibility & Mobility
      'improve_flexibility',
      'improve_mobility',
      // Athletic & Sport
      'prepare_competition',
      'sport_specific',
      'athletic_performance',
      'functional_fitness',
      'crossfit',
      // Recovery & Health
      'rehabilitation',
      'injury_prevention',
      'active_recovery',
      'posture_improvement',
      // General
      'general_fitness',
      'maintain_fitness',
      'stress_relief',
      'beginner_fitness',
    ])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropType(typeName).execute();
}
