import { Kysely, sql } from 'kysely';

const typeName = 'exercise_instance_mode';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create the enum type
  await db.schema.createType(typeName).asEnum(['reps', 'time']).execute();

  // Add the mode column with a default of 'reps'
  await sql`ALTER TABLE exercise_instances ADD COLUMN mode ${sql.raw(typeName)} NOT NULL DEFAULT 'reps'`.execute(db);

  // Backfill: set mode to 'time' for rows where execution_time is not null and reps is null
  await sql`UPDATE exercise_instances SET mode = 'time' WHERE execution_time IS NOT NULL AND reps IS NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE exercise_instances DROP COLUMN mode`.execute(db);
  await db.schema.dropType(typeName).execute();
}
