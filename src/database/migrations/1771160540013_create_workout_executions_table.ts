import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('workout_executions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('workout_schedule_id', 'uuid', (col) => col.references('workout_schedules.id').onDelete('set null'))
    .addColumn('started_at', 'timestamptz', (col) => col.notNull())
    .addColumn('completed_at', 'timestamptz')
    .addColumn('duration_seconds', 'integer')
    .addColumn('source', sql`workout_execution_source`, (col) => col.notNull().defaultTo('manual'))
    .addColumn('external_id', 'varchar(255)')
    .addColumn('notes', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex('idx_workout_executions_user_id').on('workout_executions').column('user_id').execute();

  await db.schema
    .createIndex('idx_workout_executions_workout_schedule_id')
    .on('workout_executions')
    .column('workout_schedule_id')
    .execute();

  await db.schema
    .createIndex('idx_workout_executions_started_at')
    .on('workout_executions')
    .column('started_at')
    .execute();

  await db.schema
    .createIndex('idx_workout_executions_external_id')
    .on('workout_executions')
    .column('external_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('workout_executions').execute();
}
