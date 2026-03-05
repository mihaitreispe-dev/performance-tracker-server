import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('athlete_privacy_settings')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade').unique())
    .addColumn('share_workouts', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('share_executions', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('share_analytics', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('share_calendar', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('share_personal_records', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('share_sleep_data', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('share_training_load', 'boolean', (col) => col.notNull().defaultTo(true))
    .execute();

  await db.schema
    .createIndex('idx_athlete_privacy_settings_user_id')
    .on('athlete_privacy_settings')
    .column('user_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('athlete_privacy_settings').execute();
}
