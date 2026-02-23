import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('training_stress_scores')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workout_execution_id', 'uuid', (col) =>
      col.notNull().references('workout_executions.id').onDelete('cascade').unique(),
    )
    .addColumn('tss', 'decimal(6, 2)', (col) => col.defaultTo(null)) // Training Stress Score
    .addColumn('trimp', 'decimal(6, 2)', (col) => col.defaultTo(null)) // Training Impulse
    .addColumn('aerobic_te', 'decimal(3, 1)', (col) => col.defaultTo(null)) // Aerobic Training Effect (0.0-5.0)
    .addColumn('anaerobic_te', 'decimal(3, 1)', (col) => col.defaultTo(null)) // Anaerobic Training Effect (0.0-5.0)
    .addColumn('estimated_recovery_hours', 'decimal(4, 1)', (col) => col.defaultTo(null))
    .addColumn('intensity_factor', 'decimal(4, 3)', (col) => col.defaultTo(null))
    .addColumn('normalized_power', 'decimal(6, 1)', (col) => col.defaultTo(null)) // For cycling
    .addColumn('normalized_pace', 'decimal(6, 2)', (col) => col.defaultTo(null)) // For running (min/km)
    .addColumn('hrss', 'decimal(6, 2)', (col) => col.defaultTo(null)) // Heart Rate Stress Score
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(null))
    .addColumn('calculated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for querying by workout execution
  await db.schema
    .createIndex('training_stress_scores_execution_idx')
    .on('training_stress_scores')
    .columns(['workout_execution_id'])
    .execute();

  // Index for date-based queries (join with workout_executions)
  await db.schema
    .createIndex('training_stress_scores_calculated_idx')
    .on('training_stress_scores')
    .columns(['calculated_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('training_stress_scores').execute();
}
