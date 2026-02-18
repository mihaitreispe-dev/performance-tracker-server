import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('user_integrations')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('provider', sql`integration_provider`, (col) => col.notNull())
    .addColumn('external_user_id', 'varchar(255)')
    .addColumn('access_token', 'text', (col) => col.notNull())
    .addColumn('refresh_token', 'text')
    .addColumn('token_expires_at', 'timestamptz')
    .addColumn('scopes', 'text')
    .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('last_sync_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex('idx_user_integrations_user_id').on('user_integrations').column('user_id').execute();

  // Unique constraint: one integration per provider per user
  await db.schema
    .createIndex('idx_user_integrations_unique_provider')
    .on('user_integrations')
    .columns(['user_id', 'provider'])
    .unique()
    .execute();

  await db.schema
    .createIndex('idx_user_integrations_provider_external')
    .on('user_integrations')
    .columns(['provider', 'external_user_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('user_integrations').execute();
}
