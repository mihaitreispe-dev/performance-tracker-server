import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('cardio_metrics')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workout_execution_id', 'uuid', (col) =>
      col.notNull().references('workout_executions.id').onDelete('cascade'),
    )
    .addColumn('metric_type', sql`cardio_metric_type`, (col) => col.notNull())
    .addColumn('recorded_at', 'timestamptz', (col) => col.notNull())
    .addColumn('value', 'decimal(12, 4)', (col) => col.notNull())
    .addColumn('unit', 'varchar(32)', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_cardio_metrics_workout_execution_id')
    .on('cardio_metrics')
    .column('workout_execution_id')
    .execute();

  await db.schema
    .createIndex('idx_cardio_metrics_type_recorded')
    .on('cardio_metrics')
    .columns(['workout_execution_id', 'metric_type', 'recorded_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('cardio_metrics').execute();
}
