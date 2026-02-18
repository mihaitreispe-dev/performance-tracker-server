import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('daily_training_loads')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('date', 'date', (col) => col.notNull())
    .addColumn('daily_load', 'decimal(10, 2)', (col) => col.notNull().defaultTo(0))
    .addColumn('acute_load', 'decimal(10, 2)', (col) => col.notNull().defaultTo(0))
    .addColumn('chronic_load', 'decimal(10, 2)', (col) => col.notNull().defaultTo(0))
    .addColumn('acwr', 'decimal(5, 2)', (col) => col.defaultTo(null))
    .addColumn('fatigue_score', 'decimal(5, 2)', (col) => col.defaultTo(null))
    .addColumn('fitness_score', 'decimal(10, 2)', (col) => col.defaultTo(null))
    .addColumn('form_score', 'decimal(10, 2)', (col) => col.defaultTo(null))
    .addColumn('hr_load_contribution', 'decimal(10, 2)', (col) => col.defaultTo(0))
    .addColumn('duration_load_contribution', 'decimal(10, 2)', (col) => col.defaultTo(0))
    .addColumn('volume_load_contribution', 'decimal(10, 2)', (col) => col.defaultTo(0))
    .addColumn('workout_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Unique constraint on user_id + date
  await db.schema
    .createIndex('daily_training_loads_user_date_idx')
    .on('daily_training_loads')
    .columns(['user_id', 'date'])
    .unique()
    .execute();

  // Index for querying by user and date range
  await db.schema
    .createIndex('daily_training_loads_user_date_range_idx')
    .on('daily_training_loads')
    .columns(['user_id', 'date'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('daily_training_loads').execute();
}
