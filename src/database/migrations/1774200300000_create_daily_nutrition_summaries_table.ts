import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('daily_nutrition_summaries')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('date', 'date', (col) => col.notNull())
    // Total macros
    .addColumn('total_calories', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    .addColumn('total_protein', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    .addColumn('total_carbs', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    .addColumn('total_fat', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    .addColumn('total_fiber', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    .addColumn('total_sugar', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    // Total minerals
    .addColumn('total_sodium', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    .addColumn('total_potassium', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    .addColumn('total_calcium', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    .addColumn('total_iron', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    // Total vitamins
    .addColumn('total_vitamin_a', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    .addColumn('total_vitamin_c', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    .addColumn('total_vitamin_d', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    .addColumn('total_vitamin_b12', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    // Per-meal breakdowns
    .addColumn('breakfast_calories', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    .addColumn('lunch_calories', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    .addColumn('dinner_calories', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    .addColumn('snack_calories', 'decimal(10, 2)', (col) => col.defaultTo(0).notNull())
    // Counts
    .addColumn('meal_count', 'integer', (col) => col.defaultTo(0).notNull())
    .addColumn('entry_count', 'integer', (col) => col.defaultTo(0).notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('uq_daily_nutrition_summaries_user_date', ['user_id', 'date'])
    .execute();

  // Index for querying user's summaries over a date range
  await db.schema
    .createIndex('idx_daily_nutrition_summaries_user_date')
    .on('daily_nutrition_summaries')
    .columns(['user_id', 'date'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('daily_nutrition_summaries').execute();
}
