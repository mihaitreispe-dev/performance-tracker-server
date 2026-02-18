import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createType('integration_provider').asEnum(['strava', 'garmin', 'apple_health', 'fitbit']).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropType('integration_provider').execute();
}
