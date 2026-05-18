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
      .alterColumn('organisation_id', (col) => col.setNotNull())
      .execute();
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of TABLES) {
    await db.schema
      .alterTable(table)
      .alterColumn('organisation_id', (col) => col.dropNotNull())
      .execute();
  }
}
