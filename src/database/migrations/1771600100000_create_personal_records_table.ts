import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('personal_records')
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
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('uq_personal_records_user_type_exercise', ['user_id', 'record_type', 'exercise_id'])
    .execute();

  await db.schema.createIndex('idx_personal_records_user_id').on('personal_records').column('user_id').execute();

  await db.schema
    .createIndex('idx_personal_records_exercise_id')
    .on('personal_records')
    .column('exercise_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('personal_records').execute();
}
