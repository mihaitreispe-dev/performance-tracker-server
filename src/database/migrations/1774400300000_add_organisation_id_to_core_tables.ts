import { Kysely } from 'kysely';

const TABLES = [
  'coach_athlete_relationships',
  'exercises',
  'workouts',
  'workout_plans',
  'workout_schedules',
  'coach_assigned_workouts',
];

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const table of TABLES) {
    await db.schema
      .alterTable(table)
      .addColumn('organisation_id', 'uuid', (col) => col.references('organisations.id').onDelete('cascade'))
      .execute();

    await db.schema
      .createIndex(`idx_${table}_organisation_id`)
      .on(table)
      .column('organisation_id')
      .execute();
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of TABLES) {
    await db.schema.dropIndex(`idx_${table}_organisation_id`).ifExists().execute();
    await db.schema.alterTable(table).dropColumn('organisation_id').execute();
  }
}
