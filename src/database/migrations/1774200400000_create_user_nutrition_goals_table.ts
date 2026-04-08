import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('user_nutrition_goals')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade').unique())
    // Absolute targets (grams)
    .addColumn('daily_calories', 'decimal(10, 2)')
    .addColumn('protein_g', 'decimal(10, 2)')
    .addColumn('carbs_g', 'decimal(10, 2)')
    .addColumn('fat_g', 'decimal(10, 2)')
    .addColumn('fiber_g', 'decimal(10, 2)')
    // Percentage targets (alternative to absolute)
    .addColumn('protein_percent', 'decimal(5, 2)')
    .addColumn('carbs_percent', 'decimal(5, 2)')
    .addColumn('fat_percent', 'decimal(5, 2)')
    // Weight-based auto-calculation
    .addColumn('auto_calculate_from_weight', 'boolean', (col) => col.defaultTo(false).notNull())
    .addColumn('calories_per_kg', 'decimal(6, 2)')
    .addColumn('protein_g_per_kg', 'decimal(6, 2)')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index on user_id (already unique, but explicit for clarity)
  await db.schema.createIndex('idx_user_nutrition_goals_user_id').on('user_nutrition_goals').column('user_id').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('user_nutrition_goals').execute();
}
