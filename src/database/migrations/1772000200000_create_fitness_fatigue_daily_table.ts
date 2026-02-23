import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('fitness_fatigue_daily')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('date', 'date', (col) => col.notNull())
    .addColumn('ctl', 'decimal(6, 2)', (col) => col.notNull().defaultTo(0)) // Chronic Training Load (Fitness)
    .addColumn('atl', 'decimal(6, 2)', (col) => col.notNull().defaultTo(0)) // Acute Training Load (Fatigue)
    .addColumn('tsb', 'decimal(6, 2)', (col) => col.notNull().defaultTo(0)) // Training Stress Balance (Form)
    .addColumn('daily_tss', 'decimal(6, 2)', (col) => col.notNull().defaultTo(0)) // Sum of TSS for the day
    .addColumn('ramp_rate', 'decimal(4, 2)', (col) => col.defaultTo(null)) // Weekly CTL change rate
    .addColumn('workout_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(null))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Unique constraint on user_id + date
  await db.schema
    .createIndex('fitness_fatigue_daily_user_date_idx')
    .on('fitness_fatigue_daily')
    .columns(['user_id', 'date'])
    .unique()
    .execute();

  // Index for date range queries
  await db.schema
    .createIndex('fitness_fatigue_daily_user_date_range_idx')
    .on('fitness_fatigue_daily')
    .columns(['user_id', 'date'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('fitness_fatigue_daily').execute();
}
