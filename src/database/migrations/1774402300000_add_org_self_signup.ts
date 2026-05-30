import { Kysely, sql } from 'kysely';

/**
 * Lets orgs opt in to general-population self-signup on their client-app
 * subdomain. With this flag on, a visitor to `{slug}.client.app/signup`
 * creates a Firebase account, the server provisions them as an ATHLETE
 * membership with client_type='general' (the lighter-touch track) and they
 * land in the org pre-accepted — no invite required.
 *
 * One-to-one athletes still require admin-issued invites (the existing
 * /v1/organisations/:id/memberships flow). The flag is off by default;
 * admins enable it from the Members tab.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE organisations
      ADD COLUMN allows_self_signup BOOLEAN NOT NULL DEFAULT FALSE
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE organisations DROP COLUMN IF EXISTS allows_self_signup`.execute(db);
}
