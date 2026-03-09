import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('hrv_baseline_daily')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('date', 'date', (col) => col.notNull())

    // Current day values
    .addColumn('hrv_value', 'decimal(5, 2)', (col) => col.defaultTo(null))
    .addColumn('resting_hr', 'decimal(4, 1)', (col) => col.defaultTo(null))

    // 7-day rolling stats
    .addColumn('hrv_7day_avg', 'decimal(5, 2)', (col) => col.defaultTo(null))
    .addColumn('hrv_7day_std', 'decimal(5, 2)', (col) => col.defaultTo(null))
    .addColumn('hrv_zscore', 'decimal(4, 2)', (col) => col.defaultTo(null))

    // Suppression detection
    .addColumn('is_suppressed', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('suppression_severity', 'varchar(20)', (col) => col.defaultTo(null)) // 'mild', 'moderate', 'severe'

    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(null))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Unique constraint on user_id + date
  await db.schema
    .createIndex('hrv_baseline_daily_user_date_idx')
    .on('hrv_baseline_daily')
    .columns(['user_id', 'date'])
    .unique()
    .execute();

  // Index for date range queries
  await db.schema
    .createIndex('hrv_baseline_daily_date_range_idx')
    .on('hrv_baseline_daily')
    .columns(['user_id', 'date'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('hrv_baseline_daily').execute();
}
