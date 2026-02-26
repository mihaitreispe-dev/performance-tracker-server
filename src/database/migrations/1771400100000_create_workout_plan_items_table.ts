import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('workout_plan_items')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workout_plan_id', 'uuid', (col) => col.notNull().references('workout_plans.id').onDelete('cascade'))
    .addColumn('workout_id', 'uuid', (col) => col.notNull().references('workouts.id').onDelete('cascade'))
    .addColumn('week_number', 'integer', (col) => col.notNull().check(sql`week_number >= 1`))
    .addColumn('day_of_week', 'integer', (col) => col.notNull().check(sql`day_of_week >= 1 AND day_of_week <= 7`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('uq_workout_plan_items_plan_week_day', ['workout_plan_id', 'week_number', 'day_of_week'])
    .execute();

  await db.schema
    .createIndex('idx_workout_plan_items_workout_plan_id')
    .on('workout_plan_items')
    .column('workout_plan_id')
    .execute();
  await db.schema
    .createIndex('idx_workout_plan_items_workout_id')
    .on('workout_plan_items')
    .column('workout_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('workout_plan_items').execute();
}
