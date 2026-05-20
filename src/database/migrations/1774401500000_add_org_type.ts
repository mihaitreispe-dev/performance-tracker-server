import { Kysely, sql } from 'kysely';

/**
 * Phase 8 — splits org creation into two tracks. Each org carries an `org_type`:
 *
 *   - organisation: multi-coach team / studio / gym. User names the org explicitly,
 *     full Team-management surface (invite coaches + admins), default verbiage
 *     'clients'.
 *   - individual: solo coach onboarding their own athletes. Org name is generated
 *     from the user's display_name, no separate team-management surface, default
 *     verbiage 'athletes'.
 *
 * Existing rows get the default 'organisation' value — multi-coach is the wider
 * superset shape, and any org created before the split most plausibly belongs there
 * (was probably created by the migration backfill in 1774400400000).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TYPE organisation_type AS ENUM ('organisation', 'individual')`.execute(db);
  await db.schema
    .alterTable('organisations')
    .addColumn('org_type', sql`organisation_type`, (col) =>
      col.notNull().defaultTo(sql`'organisation'::organisation_type`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('organisations').dropColumn('org_type').execute();
  await sql`DROP TYPE organisation_type`.execute(db);
}
