import { Kysely, sql } from 'kysely';

/**
 * Per-org "uses external app" flag.
 *
 * When TRUE, the org has built (or licensed) their own white-label
 * client app that talks to our public API via OAuth + API key. Push
 * notifications + checkout deep-links + onboarding redirects should
 * target the org's own app, not our first-party athlete app.
 *
 * When FALSE (default), the org's clients use our first-party athlete
 * app — same behaviour as before this flag existed.
 *
 * No index — the flag is read at notification-fanout time once per
 * delivery, and on initial app boot to decide which auth/onboarding
 * link to surface. Both sites already hit the org row by primary key.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE organisations
      ADD COLUMN uses_external_app BOOLEAN NOT NULL DEFAULT FALSE
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE organisations
      DROP COLUMN IF EXISTS uses_external_app
  `.execute(db);
}
