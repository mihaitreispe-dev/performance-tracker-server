import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('multi_stream_load_daily')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('date', 'date', (col) => col.notNull())

    // Aerobic stream (7/42-day time constants)
    .addColumn('aerobic_ctl', 'decimal(6, 2)', (col) => col.defaultTo(0))
    .addColumn('aerobic_atl', 'decimal(6, 2)', (col) => col.defaultTo(0))
    .addColumn('aerobic_tsb', 'decimal(6, 2)', (col) => col.defaultTo(0))
    .addColumn('aerobic_daily_load', 'decimal(6, 2)', (col) => col.defaultTo(0))

    // Musculoskeletal stream (5/21-day time constants)
    .addColumn('msk_ctl', 'decimal(6, 2)', (col) => col.defaultTo(0))
    .addColumn('msk_atl', 'decimal(6, 2)', (col) => col.defaultTo(0))
    .addColumn('msk_tsb', 'decimal(6, 2)', (col) => col.defaultTo(0))
    .addColumn('msk_daily_load', 'decimal(6, 2)', (col) => col.defaultTo(0))

    // Neural/CNS stream (3/10-day time constants)
    .addColumn('neural_ctl', 'decimal(6, 2)', (col) => col.defaultTo(0))
    .addColumn('neural_atl', 'decimal(6, 2)', (col) => col.defaultTo(0))
    .addColumn('neural_tsb', 'decimal(6, 2)', (col) => col.defaultTo(0))
    .addColumn('neural_daily_load', 'decimal(6, 2)', (col) => col.defaultTo(0))

    // Composite readiness
    .addColumn('readiness_score', 'decimal(4, 2)', (col) => col.defaultTo(null))
    .addColumn('readiness_override_reason', 'varchar(50)', (col) => col.defaultTo(null))
    .addColumn('limiting_stream', 'varchar(20)', (col) => col.defaultTo(null))

    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(null))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Unique constraint on user_id + date
  await db.schema
    .createIndex('multi_stream_load_daily_user_date_idx')
    .on('multi_stream_load_daily')
    .columns(['user_id', 'date'])
    .unique()
    .execute();

  // Index for date range queries
  await db.schema
    .createIndex('multi_stream_load_daily_date_range_idx')
    .on('multi_stream_load_daily')
    .columns(['user_id', 'date'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('multi_stream_load_daily').execute();
}
