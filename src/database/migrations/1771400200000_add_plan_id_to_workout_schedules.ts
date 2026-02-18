import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('workout_schedules')
    .addColumn('workout_plan_id', 'uuid', (col) => col.references('workout_plans.id').onDelete('set null'))
    .execute();

  await db.schema.createIndex('idx_workout_schedules_workout_plan_id').on('workout_schedules').column('workout_plan_id').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('workout_schedules').dropColumn('workout_plan_id').execute();
}
