import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('food_log_entries')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('food_id', 'uuid', (col) => col.references('foods.id').onDelete('set null'))
    .addColumn('log_date', 'date', (col) => col.notNull())
    .addColumn('meal_type', sql`meal_type`, (col) => col.notNull())
    .addColumn('quantity', 'decimal(10, 2)', (col) => col.defaultTo(1).notNull())
    .addColumn('serving_multiplier', 'decimal(10, 2)', (col) => col.defaultTo(1).notNull())
    // Quick add fields (for logging without selecting a food)
    .addColumn('is_quick_add', 'boolean', (col) => col.defaultTo(false).notNull())
    .addColumn('quick_add_calories', 'decimal(10, 2)')
    .addColumn('quick_add_protein', 'decimal(10, 2)')
    .addColumn('quick_add_carbs', 'decimal(10, 2)')
    .addColumn('quick_add_fat', 'decimal(10, 2)')
    .addColumn('quick_add_description', 'varchar(255)')
    // Notes
    .addColumn('notes', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Primary query index: user's logs by date
  await db.schema
    .createIndex('idx_food_log_entries_user_date')
    .on('food_log_entries')
    .columns(['user_id', 'log_date'])
    .execute();

  // Index for querying by meal type
  await db.schema
    .createIndex('idx_food_log_entries_user_date_meal')
    .on('food_log_entries')
    .columns(['user_id', 'log_date', 'meal_type'])
    .execute();

  // Index on food_id for reverse lookups
  await db.schema.createIndex('idx_food_log_entries_food_id').on('food_log_entries').column('food_id').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('food_log_entries').execute();
}
