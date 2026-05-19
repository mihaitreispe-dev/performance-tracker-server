import { Kysely, sql } from 'kysely';

/**
 * API key surface for orgs that want to integrate the platform into their own apps.
 *
 *   organisation_api_keys — one row per issued key. The full key is hashed (bcrypt);
 *     only `key_prefix` is stored cleartext for fast lookup + UI display.
 *
 *   organisation_api_usage — raw request log. One row per /v1/public/* call. Kept
 *     for 30 days (TTL'd by a separate cron) and rolled up into dailies for the
 *     usage dashboard. Indexed on (organisation_id, created_at) so range queries
 *     for "last 30 days" stay cheap.
 *
 *   organisation_api_usage_daily — pre-aggregated counters per (org, key, endpoint,
 *     date). Populated by the rollup CLI; cheap to chart.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('organisation_api_keys')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar(120)', (col) => col.notNull())
    .addColumn('key_prefix', 'varchar(40)', (col) => col.notNull().unique())
    .addColumn('key_hash', 'varchar(255)', (col) => col.notNull())
    .addColumn('scopes', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('last_used_at', 'timestamptz')
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('expires_at', 'timestamptz')
    .addColumn('created_by_user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('restrict'),
    )
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('organisation_api_keys_org_id_idx')
    .on('organisation_api_keys')
    .column('organisation_id')
    .execute();

  await db.schema
    .createTable('organisation_api_usage')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('api_key_id', 'uuid', (col) =>
      col.references('organisation_api_keys.id').onDelete('set null'),
    )
    .addColumn('endpoint', 'varchar(200)', (col) => col.notNull())
    .addColumn('method', 'varchar(10)', (col) => col.notNull())
    .addColumn('status_code', 'integer', (col) => col.notNull())
    .addColumn('response_ms', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('organisation_api_usage_org_created_idx')
    .on('organisation_api_usage')
    .columns(['organisation_id', 'created_at'])
    .execute();

  await db.schema
    .createTable('organisation_api_usage_daily')
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('api_key_id', 'uuid', (col) =>
      col.references('organisation_api_keys.id').onDelete('set null'),
    )
    .addColumn('endpoint', 'varchar(200)', (col) => col.notNull())
    .addColumn('date', 'date', (col) => col.notNull())
    .addColumn('request_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('error_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('p95_response_ms', 'integer')
    .addPrimaryKeyConstraint('organisation_api_usage_daily_pk', [
      'organisation_id',
      'api_key_id',
      'endpoint',
      'date',
    ])
    .execute();

  await db.schema
    .createIndex('organisation_api_usage_daily_org_date_idx')
    .on('organisation_api_usage_daily')
    .columns(['organisation_id', 'date'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('organisation_api_usage_daily').execute();
  await db.schema.dropTable('organisation_api_usage').execute();
  await db.schema.dropTable('organisation_api_keys').execute();
}
