import { Kysely, sql } from 'kysely';

/**
 * Phase 4 — OAuth-style code grant for hosted client auth.
 *
 *   organisation_api_keys.redirect_uris — allow-list of redirect_uris the key
 *     may return users to. Without this gate, the hosted auth page is an open
 *     redirector; with it, only the integrator's own backends/apps can be
 *     targeted by an authorization code minted for their key.
 *
 *   oauth_authorization_codes — short-lived (5 min) one-time-use codes minted by
 *     the hosted auth page after Firebase login, redeemed by the integrator's
 *     backend via POST /v1/public/auth/token. Single-use enforced via `used_at`
 *     so a leaked code can only be redeemed once.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('organisation_api_keys')
    .addColumn('redirect_uris', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .execute();

  await db.schema
    .createTable('oauth_authorization_codes')
    .addColumn('code', 'varchar(120)', (col) => col.primaryKey())
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('api_key_id', 'uuid', (col) =>
      col.notNull().references('organisation_api_keys.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('redirect_uri', 'varchar(2000)', (col) => col.notNull())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('used_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('oauth_authorization_codes_expires_at_idx')
    .on('oauth_authorization_codes')
    .column('expires_at')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('oauth_authorization_codes').execute();
  await db.schema.alterTable('organisation_api_keys').dropColumn('redirect_uris').execute();
}
