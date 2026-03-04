import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('wearable_provider_priorities')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('category', sql`wearable_data_category`, (col) => col.notNull())
    .addColumn('provider', sql`wearable_provider`, (col) => col.notNull())
    .addColumn('priority', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Unique constraint: one priority per user per category per provider
  await db.schema
    .createIndex('idx_provider_priorities_unique')
    .on('wearable_provider_priorities')
    .columns(['user_id', 'category', 'provider'])
    .unique()
    .execute();

  // Index for efficient priority ordering
  await db.schema
    .createIndex('idx_provider_priorities_order')
    .on('wearable_provider_priorities')
    .columns(['user_id', 'category', 'priority'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('wearable_provider_priorities').execute();
}
