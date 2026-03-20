import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('sleep_baselines')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('date', 'date', (col) => col.notNull())

    // TST (Total Sleep Time) baselines
    .addColumn('tst_14day_avg', 'integer') // seconds
    .addColumn('tst_14day_std', 'integer') // seconds

    // SE (Sleep Efficiency) baselines
    .addColumn('se_14day_avg', 'decimal(5, 4)') // 0.0-1.0
    .addColumn('se_14day_std', 'decimal(5, 4)')

    // HRV during sleep baselines
    .addColumn('sleep_hrv_14day_avg', 'decimal(6, 2)')
    .addColumn('sleep_hrv_14day_std', 'decimal(6, 2)')

    // HR nadir baselines
    .addColumn('hr_nadir_14day_avg', 'decimal(5, 2)')
    .addColumn('hr_nadir_14day_std', 'decimal(5, 2)')

    // Sleep debt tracking (cumulative deviation from optimal, negative = deficit)
    .addColumn('sleep_debt_7day', 'integer') // seconds
    .addColumn('sleep_debt_14day', 'integer') // seconds

    .addColumn('data_points_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Unique constraint on user_id, date
  await db.schema
    .createIndex('idx_sleep_baselines_user_date')
    .on('sleep_baselines')
    .columns(['user_id', 'date'])
    .unique()
    .execute();

  // Index for querying by user
  await db.schema.createIndex('idx_sleep_baselines_user').on('sleep_baselines').column('user_id').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('sleep_baselines').execute();
}
