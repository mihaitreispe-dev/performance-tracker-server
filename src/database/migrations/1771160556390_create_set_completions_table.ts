import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('set_completions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workout_execution_id', 'uuid', (col) =>
      col.notNull().references('workout_executions.id').onDelete('cascade'),
    )
    .addColumn('exercise_instance_id', 'uuid', (col) =>
      col.notNull().references('exercise_instances.id').onDelete('cascade'),
    )
    .addColumn('set_number', 'integer', (col) => col.notNull())
    .addColumn('actual_reps', 'integer')
    .addColumn('actual_load', 'decimal(10, 2)')
    .addColumn('actual_time_seconds', 'integer')
    .addColumn('rpe', 'smallint', (col) => col.check(sql`rpe >= 1 AND rpe <= 10`))
    .addColumn('completed_at', 'timestamptz', (col) => col.notNull())
    .addColumn('skipped', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('notes', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_set_completions_workout_execution_id')
    .on('set_completions')
    .column('workout_execution_id')
    .execute();

  await db.schema
    .createIndex('idx_set_completions_exercise_instance_id')
    .on('set_completions')
    .column('exercise_instance_id')
    .execute();

  // Unique constraint to prevent duplicate set completions
  await db.schema
    .createIndex('idx_set_completions_unique')
    .on('set_completions')
    .columns(['workout_execution_id', 'exercise_instance_id', 'set_number'])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('set_completions').execute();
}
