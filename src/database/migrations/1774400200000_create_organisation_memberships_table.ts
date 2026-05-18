import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('organisation_memberships')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('role', sql`organisation_role`, (col) => col.notNull())
    .addColumn('invited_by_user_id', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('invited_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('accepted_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_org_memberships_org_user')
    .on('organisation_memberships')
    .columns(['organisation_id', 'user_id'])
    .unique()
    .execute();

  await db.schema
    .createIndex('idx_org_memberships_user')
    .on('organisation_memberships')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('idx_org_memberships_org')
    .on('organisation_memberships')
    .column('organisation_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('organisation_memberships').execute();
}
