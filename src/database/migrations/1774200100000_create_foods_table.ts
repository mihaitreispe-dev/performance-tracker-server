import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('foods')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('external_id', 'varchar(100)')
    .addColumn('source', sql`food_source`, (col) => col.notNull())
    .addColumn('barcode', 'varchar(50)')
    .addColumn('name', 'varchar(500)', (col) => col.notNull())
    .addColumn('brand', 'varchar(255)')
    .addColumn('serving_size_grams', 'decimal(10, 2)', (col) => col.defaultTo(100))
    .addColumn('serving_size_description', 'varchar(100)')
    // Macros
    .addColumn('calories', 'decimal(10, 2)')
    .addColumn('protein_g', 'decimal(10, 2)')
    .addColumn('carbs_g', 'decimal(10, 2)')
    .addColumn('fat_g', 'decimal(10, 2)')
    .addColumn('fiber_g', 'decimal(10, 2)')
    .addColumn('sugar_g', 'decimal(10, 2)')
    // Minerals
    .addColumn('sodium_mg', 'decimal(10, 2)')
    .addColumn('potassium_mg', 'decimal(10, 2)')
    .addColumn('calcium_mg', 'decimal(10, 2)')
    .addColumn('iron_mg', 'decimal(10, 2)')
    // Vitamins
    .addColumn('vitamin_a_mcg', 'decimal(10, 2)')
    .addColumn('vitamin_c_mg', 'decimal(10, 2)')
    .addColumn('vitamin_d_mcg', 'decimal(10, 2)')
    .addColumn('vitamin_b12_mcg', 'decimal(10, 2)')
    // Fats breakdown
    .addColumn('saturated_fat_g', 'decimal(10, 2)')
    .addColumn('trans_fat_g', 'decimal(10, 2)')
    .addColumn('cholesterol_mg', 'decimal(10, 2)')
    // Tracking
    .addColumn('created_by_user_id', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('use_count', 'integer', (col) => col.defaultTo(0).notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Unique index on external_id (for USDA fdc_id and OFF barcode)
  await db.schema
    .createIndex('idx_foods_external_id')
    .on('foods')
    .column('external_id')
    .unique()
    .where('external_id', 'is not', null)
    .execute();

  // Index on barcode for quick lookup
  await db.schema.createIndex('idx_foods_barcode').on('foods').column('barcode').where('barcode', 'is not', null).execute();

  // GIN index on name for full-text search
  await sql`CREATE INDEX idx_foods_name_gin ON foods USING gin(to_tsvector('english', name))`.execute(db);

  // Index on use_count for popularity sorting
  await db.schema.createIndex('idx_foods_use_count').on('foods').column('use_count').execute();

  // Index on source for filtering
  await db.schema.createIndex('idx_foods_source').on('foods').column('source').execute();

  // Index for created_by_user_id for user's custom foods
  await db.schema
    .createIndex('idx_foods_created_by_user_id')
    .on('foods')
    .column('created_by_user_id')
    .where('created_by_user_id', 'is not', null)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('foods').execute();
}
