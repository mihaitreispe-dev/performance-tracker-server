import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('personal_record_history')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('record_type', sql`personal_record_type`, (col) => col.notNull())
    .addColumn('exercise_id', 'uuid', (col) => col.references('exercises.id').onDelete('cascade'))
    .addColumn('value', 'numeric', (col) => col.notNull())
    .addColumn('unit', 'varchar(20)', (col) => col.notNull())
    .addColumn('workout_execution_id', 'uuid', (col) =>
      col.notNull().references('workout_executions.id').onDelete('cascade'),
    )
    .addColumn('achieved_at', 'timestamptz', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_personal_record_history_evolution')
    .on('personal_record_history')
    .columns(['user_id', 'record_type', 'exercise_id', 'achieved_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('personal_record_history').execute();
}
