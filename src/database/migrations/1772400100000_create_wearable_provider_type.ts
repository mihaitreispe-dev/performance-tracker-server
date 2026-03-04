import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createType('wearable_provider')
    .asEnum([
      'garmin',
      'whoop',
      'oura',
      'polar',
      'suunto',
      'strava',
      'apple_health',
      'samsung_health',
      'fitbit',
      'coros',
      'wahoo',
    ])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropType('wearable_provider').execute();
}
