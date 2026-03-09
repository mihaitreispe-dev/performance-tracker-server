import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('athlete_intake')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('coach_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))

    // Goals (multi-select from WorkoutPlanGoal enum)
    .addColumn('primary_goals', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))

    // Availability
    .addColumn('training_days_per_week', 'integer')
    .addColumn('preferred_session_duration', 'integer') // minutes
    .addColumn('available_days', sql`text[]`) // ['monday', 'tuesday', ...]

    // Fitness Level
    .addColumn('experience_level', 'text') // 'beginner' | 'intermediate' | 'advanced'
    .addColumn('current_activity_level', 'text') // 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active'

    // Health & Limitations
    .addColumn('injuries_limitations', 'text')
    .addColumn('medical_conditions', 'text')

    // Equipment & Environment
    .addColumn('equipment_access', sql`text[]`) // ['dumbbells', 'barbell', 'machines', 'cardio_equipment', 'none']
    .addColumn('training_location', 'text') // 'home' | 'gym' | 'outdoor' | 'mixed'

    // Sport-specific
    .addColumn('primary_sport', 'text')
    .addColumn('competitive_events', 'text') // upcoming races/competitions

    // Additional context
    .addColumn('additional_notes', 'text')

    // Completion tracking
    .addColumn('completed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Unique constraint: one intake per user-coach relationship
  await db.schema
    .createIndex('idx_athlete_intake_user_coach')
    .on('athlete_intake')
    .columns(['user_id', 'coach_id'])
    .unique()
    .execute();

  // Index for finding by user_id
  await db.schema.createIndex('idx_athlete_intake_user_id').on('athlete_intake').column('user_id').execute();

  // Index for finding by coach_id
  await db.schema.createIndex('idx_athlete_intake_coach_id').on('athlete_intake').column('coach_id').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('athlete_intake').execute();
}
