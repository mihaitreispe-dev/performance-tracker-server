import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('workout_schedules').addColumn('coach_notes', 'text').execute();

  await db.schema
    .alterTable('workout_schedules')
    .addColumn('created_by_coach_id', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('workout_schedules').dropColumn('created_by_coach_id').execute();
  await db.schema.alterTable('workout_schedules').dropColumn('coach_notes').execute();
}
