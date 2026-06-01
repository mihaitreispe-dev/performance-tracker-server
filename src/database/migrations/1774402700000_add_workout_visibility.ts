import { Kysely, sql } from 'kysely';

/**
 * Explicit visibility on workouts: 'personal' vs 'org_library'.
 *
 * Pre-migration the list endpoint filtered strictly on user_id, so
 * every workout effectively behaved as a private draft regardless of
 * who created it — coaches couldn't browse each other's work and the
 * "library" concept lived only in the page title. We now persist the
 * distinction:
 *
 *   personal     — only the creator + their coach (via
 *                  coach_athlete_relationships, applied at read time)
 *                  + org admins can see it. The default — preserves
 *                  the current behaviour for existing rows.
 *   org_library  — visible to every member of the org. Coaches /
 *                  admins / owners publish here; athletes can't set
 *                  this value (the service rejects).
 *
 * Composite index on (organisation_id, visibility) supports the
 * "show me everything in the library for this org" list query.
 * created_at desc remains the row-order index inferred at query
 * time by the existing list code.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE workouts
      ADD COLUMN visibility VARCHAR(32) NOT NULL DEFAULT 'personal'
  `.execute(db);
  await sql`
    CREATE INDEX idx_workouts_org_visibility
      ON workouts (organisation_id, visibility)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_workouts_org_visibility`.execute(db);
  await sql`ALTER TABLE workouts DROP COLUMN IF EXISTS visibility`.execute(db);
}
