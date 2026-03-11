import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create wellness check-in source enum
  await db.schema.createType('wellness_checkin_source').asEnum(['manual', 'notification', 'scheduled']).execute();

  // Create quick_wellness_checkins table
  await db.schema
    .createTable('quick_wellness_checkins')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.references('users.id').onDelete('cascade').notNull())
    .addColumn('checkin_date', 'date', (col) => col.notNull())
    .addColumn('sleep_quality', 'smallint')
    .addColumn('energy_level', 'smallint')
    .addColumn('muscle_soreness', 'smallint')
    .addColumn('stress_level', 'smallint')
    .addColumn('training_readiness', 'smallint')
    .addColumn('completion_seconds', 'integer')
    .addColumn('source', sql`wellness_checkin_source`, (col) => col.defaultTo('manual').notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Create unique index on user_id + checkin_date
  await db.schema
    .createIndex('quick_wellness_checkins_user_date_idx')
    .on('quick_wellness_checkins')
    .columns(['user_id', 'checkin_date'])
    .unique()
    .execute();

  // Create index for queries by user
  await db.schema
    .createIndex('quick_wellness_checkins_user_id_idx')
    .on('quick_wellness_checkins')
    .column('user_id')
    .execute();

  // Add check constraints for 1-5 scale values
  await sql`ALTER TABLE quick_wellness_checkins ADD CONSTRAINT sleep_quality_range CHECK (sleep_quality >= 1 AND sleep_quality <= 5)`.execute(
    db,
  );
  await sql`ALTER TABLE quick_wellness_checkins ADD CONSTRAINT energy_level_range CHECK (energy_level >= 1 AND energy_level <= 5)`.execute(
    db,
  );
  await sql`ALTER TABLE quick_wellness_checkins ADD CONSTRAINT muscle_soreness_range CHECK (muscle_soreness >= 1 AND muscle_soreness <= 5)`.execute(
    db,
  );
  await sql`ALTER TABLE quick_wellness_checkins ADD CONSTRAINT stress_level_range CHECK (stress_level >= 1 AND stress_level <= 5)`.execute(
    db,
  );
  await sql`ALTER TABLE quick_wellness_checkins ADD CONSTRAINT training_readiness_range CHECK (training_readiness >= 1 AND training_readiness <= 5)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('quick_wellness_checkins').execute();
  await db.schema.dropType('wellness_checkin_source').execute();
}
