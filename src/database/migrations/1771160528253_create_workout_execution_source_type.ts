import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createType('workout_execution_source')
    .asEnum(['manual', 'garmin', 'strava', 'apple_health', 'fitbit'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropType('workout_execution_source').execute();
}
