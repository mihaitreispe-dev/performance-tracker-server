import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add share_wellness_checkins column to athlete_privacy_settings
  await db.schema
    .alterTable('athlete_privacy_settings')
    .addColumn('share_wellness_checkins', 'boolean', (col) => col.defaultTo(true).notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('athlete_privacy_settings').dropColumn('share_wellness_checkins').execute();
}
