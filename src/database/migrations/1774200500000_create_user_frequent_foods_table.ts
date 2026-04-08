import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('user_frequent_foods')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('food_id', 'uuid', (col) => col.notNull().references('foods.id').onDelete('cascade'))
    .addColumn('use_count', 'integer', (col) => col.defaultTo(1).notNull())
    .addColumn('last_used_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('is_favorite', 'boolean', (col) => col.defaultTo(false).notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('uq_user_frequent_foods_user_food', ['user_id', 'food_id'])
    .execute();

  // Index for fetching user's frequent foods sorted by use count
  await db.schema
    .createIndex('idx_user_frequent_foods_user_count')
    .on('user_frequent_foods')
    .columns(['user_id', 'use_count'])
    .execute();

  // Index for fetching user's favorites
  await db.schema
    .createIndex('idx_user_frequent_foods_user_favorite')
    .on('user_frequent_foods')
    .columns(['user_id', 'is_favorite'])
    .where('is_favorite', '=', true)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('user_frequent_foods').execute();
}
