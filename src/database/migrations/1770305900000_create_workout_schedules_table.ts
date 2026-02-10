import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('workout_schedules')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('workout_id', 'uuid', (col) => col.notNull().references('workouts.id').onDelete('cascade'))
    .addColumn('scheduled_date', 'date', (col) => col.notNull())
    .addColumn('completed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex('idx_workout_schedules_user_id').on('workout_schedules').column('user_id').execute();
  await db.schema
    .createIndex('idx_workout_schedules_workout_id')
    .on('workout_schedules')
    .column('workout_id')
    .execute();
  await db.schema
    .createIndex('idx_workout_schedules_scheduled_date')
    .on('workout_schedules')
    .column('scheduled_date')
    .execute();
  await db.schema
    .createIndex('idx_workout_schedules_user_date')
    .on('workout_schedules')
    .columns(['user_id', 'scheduled_date'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('workout_schedules').execute();
}
