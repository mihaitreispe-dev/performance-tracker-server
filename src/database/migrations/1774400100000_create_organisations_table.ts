import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('organisations')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('slug', 'varchar(100)', (col) => col.notNull())
    .addColumn('logo_s3_bucket', 'varchar(255)')
    .addColumn('logo_s3_key', 'varchar(500)')
    .addColumn('created_by_user_id', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex('idx_organisations_slug').on('organisations').column('slug').unique().execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('organisations').execute();
}
