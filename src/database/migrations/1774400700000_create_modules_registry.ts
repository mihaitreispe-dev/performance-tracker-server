import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. The module catalogue. Rows seeded by the modules service at boot.
  await db.schema
    .createTable('modules')
    .addColumn('key', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'varchar(1000)')
    .addColumn('default_enabled', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('sort_order', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // 2. Org-level enable/disable overrides. Absence = use module.default_enabled.
  await db.schema
    .createTable('organisation_module_settings')
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('module_key', 'varchar(64)', (col) => col.notNull().references('modules.key').onDelete('cascade'))
    .addColumn('enabled', 'boolean', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('pk_organisation_module_settings', ['organisation_id', 'module_key'])
    .execute();

  // 3. Per-athlete coach overrides (within an org). Absence = use org setting (or module default).
  await db.schema
    .createTable('athlete_module_overrides')
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('athlete_user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('module_key', 'varchar(64)', (col) => col.notNull().references('modules.key').onDelete('cascade'))
    .addColumn('enabled', 'boolean', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('pk_athlete_module_overrides', ['organisation_id', 'athlete_user_id', 'module_key'])
    .execute();

  await db.schema
    .createIndex('idx_ath_mod_overrides_athlete')
    .on('athlete_module_overrides')
    .columns(['organisation_id', 'athlete_user_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('athlete_module_overrides').execute();
  await db.schema.dropTable('organisation_module_settings').execute();
  await db.schema.dropTable('modules').execute();
}
