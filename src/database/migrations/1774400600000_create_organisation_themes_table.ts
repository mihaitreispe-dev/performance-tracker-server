import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('organisation_themes')
    .addColumn('organisation_id', 'uuid', (col) =>
      col.primaryKey().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('theme_tokens', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('copy_overrides', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('font_family', 'varchar(255)')
    .addColumn('favicon_s3_bucket', 'varchar(255)')
    .addColumn('favicon_s3_key', 'varchar(500)')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('organisation_themes').execute();
}
