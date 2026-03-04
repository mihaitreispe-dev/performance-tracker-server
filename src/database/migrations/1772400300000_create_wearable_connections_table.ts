import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('wearable_provider_connections')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('provider', sql`wearable_provider`, (col) => col.notNull())
    .addColumn('openwearables_user_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('external_user_id', 'varchar(255)')
    .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('supported_categories', sql`wearable_data_category[]`, (col) => col.notNull())
    .addColumn('last_sync_at', 'timestamptz')
    .addColumn('last_sync_status', 'varchar(50)')
    .addColumn('last_sync_error', 'text')
    .addColumn('connected_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Unique constraint: one connection per user per provider
  await db.schema
    .createIndex('idx_wearable_connections_user_provider')
    .on('wearable_provider_connections')
    .columns(['user_id', 'provider'])
    .unique()
    .execute();

  // Index for looking up by OpenWearables user ID
  await db.schema
    .createIndex('idx_wearable_connections_ow_user')
    .on('wearable_provider_connections')
    .column('openwearables_user_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('wearable_provider_connections').execute();
}
