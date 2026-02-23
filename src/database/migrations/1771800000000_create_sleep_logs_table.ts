import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('sleep_logs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('log_date', 'date', (col) => col.notNull())
    .addColumn('start_time', 'timestamptz')
    .addColumn('end_time', 'timestamptz')
    .addColumn('total_duration_seconds', 'integer', (col) => col.notNull())
    .addColumn('awake_duration_seconds', 'integer', (col) => col.defaultTo(0))
    .addColumn('light_duration_seconds', 'integer', (col) => col.defaultTo(0))
    .addColumn('deep_duration_seconds', 'integer', (col) => col.defaultTo(0))
    .addColumn('rem_duration_seconds', 'integer', (col) => col.defaultTo(0))
    .addColumn('avg_resting_hr', 'integer')
    .addColumn('avg_hrv', 'integer')
    .addColumn('hr_samples', 'jsonb')
    .addColumn('source', 'varchar(50)', (col) => col.defaultTo('manual'))
    .addColumn('external_id', 'varchar(255)')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Unique constraint on user_id, log_date, source
  await db.schema
    .createIndex('idx_sleep_logs_user_date_source')
    .on('sleep_logs')
    .columns(['user_id', 'log_date', 'source'])
    .unique()
    .execute();

  // Index for querying by user and date
  await db.schema
    .createIndex('idx_sleep_logs_user_date')
    .on('sleep_logs')
    .columns(['user_id', 'log_date'])
    .execute();

  // Index for external_id lookups (for Garmin sync)
  await db.schema
    .createIndex('idx_sleep_logs_external')
    .on('sleep_logs')
    .column('external_id')
    .where('external_id', 'is not', null)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('sleep_logs').execute();
}
