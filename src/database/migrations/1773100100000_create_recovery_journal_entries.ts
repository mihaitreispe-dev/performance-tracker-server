import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('recovery_journal_entries')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('entry_date', 'date', (col) => col.notNull())

    // Sleep quality (manual supplement to wearable data)
    .addColumn('sleep_quality_rating', 'smallint', (col) => col.defaultTo(null)) // 1-5
    .addColumn('sleep_latency_minutes', 'integer', (col) => col.defaultTo(null))
    .addColumn('sleep_disturbances', 'integer', (col) => col.defaultTo(null))

    // Subjective metrics (1-10 sliders)
    .addColumn('perceived_recovery', 'smallint', (col) => col.defaultTo(null))
    .addColumn('muscle_soreness', 'smallint', (col) => col.defaultTo(null))
    .addColumn('energy_level', 'smallint', (col) => col.defaultTo(null))
    .addColumn('mood', 'smallint', (col) => col.defaultTo(null))
    .addColumn('stress_level', 'smallint', (col) => col.defaultTo(null))
    .addColumn('motivation_level', 'smallint', (col) => col.defaultTo(null))

    // Lifestyle factors
    .addColumn('caffeine_mg', 'integer', (col) => col.defaultTo(null))
    .addColumn('caffeine_cutoff_time', 'time', (col) => col.defaultTo(null))
    .addColumn('alcohol_units', 'decimal(3, 1)', (col) => col.defaultTo(null))
    .addColumn('hydration_liters', 'decimal(3, 1)', (col) => col.defaultTo(null))
    .addColumn('meal_quality', 'smallint', (col) => col.defaultTo(null)) // 1-5

    // Notes
    .addColumn('injury_concerns', 'text', (col) => col.defaultTo(null))
    .addColumn('notes', 'text', (col) => col.defaultTo(null))

    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Unique constraint on user_id + entry_date
  await db.schema
    .createIndex('recovery_journal_entries_user_date_idx')
    .on('recovery_journal_entries')
    .columns(['user_id', 'entry_date'])
    .unique()
    .execute();

  // Index for date range queries
  await db.schema
    .createIndex('recovery_journal_entries_date_range_idx')
    .on('recovery_journal_entries')
    .columns(['user_id', 'entry_date'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('recovery_journal_entries').execute();
}
