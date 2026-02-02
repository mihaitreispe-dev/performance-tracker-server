import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('firebase_uid', 'varchar(128)', (col) => col.notNull().unique())
    .addColumn('email', 'varchar(255)', (col) => col.notNull())
    .addColumn('display_name', 'varchar(255)')
    .addColumn('first_name', 'varchar(255)')
    .addColumn('last_name', 'varchar(255)')
    .addColumn('picture_s3_bucket', 'text')
    .addColumn('picture_s3_key', 'text')
    .addColumn('provider', 'varchar(50)', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('last_sign_in_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('roles', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{user}'`))
    .addColumn('fcm_tokens', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .execute();

  await db.schema.createIndex('idx_users_email').on('users').column('email').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('users').execute();
}
