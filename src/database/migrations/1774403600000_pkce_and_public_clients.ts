import { Kysely, sql } from 'kysely';

/**
 * Phase: PKCE + public-client API keys
 *
 * The /v1/public/auth/token endpoint was originally designed around an
 * integrator backend that holds the key secret. That model doesn't fit
 * pure-browser SPAs (the rehabit sample, embedded white-label apps, mobile
 * apps without a server), where the key would have to be bundled into the
 * client — i.e. published.
 *
 * The OAuth-2.1-blessed answer is PKCE (RFC 7636): the browser proves it
 * owns the originating session by sending a `code_verifier` whose SHA256 it
 * declared upfront as `code_challenge`. Combined with an opt-in "public
 * client" flag per API key (no secret check on /token), this lets a
 * browser-only client complete the flow safely.
 *
 *   organisation_api_keys.is_public_client — when true, /token skips the
 *     bcrypt secret check and requires PKCE on exchange instead. Origin of
 *     the request is also gated against the key's redirect_uri allow-list.
 *
 *   oauth_authorization_codes.code_challenge / code_challenge_method —
 *     captured at /authorize time; the verifier on /token is hashed and
 *     compared. NULL on both means "no PKCE was used", which we still
 *     accept for private keys to keep the existing integrator flow working.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('organisation_api_keys')
    .addColumn('is_public_client', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute();

  await db.schema
    .alterTable('oauth_authorization_codes')
    .addColumn('code_challenge', 'varchar(256)')
    .addColumn('code_challenge_method', 'varchar(16)')
    .execute();

  // Flip the seeded sample-app key to public so the existing rehabit dev
  // setup keeps working after the PKCE switch lands in the client. Anyone
  // who hasn't run the seed yet picks it up via the seed update below.
  await sql`
    UPDATE organisation_api_keys
    SET is_public_client = TRUE
    WHERE name = 'Sample app (seeded)'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('oauth_authorization_codes')
    .dropColumn('code_challenge_method')
    .dropColumn('code_challenge')
    .execute();
  await db.schema
    .alterTable('organisation_api_keys')
    .dropColumn('is_public_client')
    .execute();
}
