import { Kysely, sql } from 'kysely';

/**
 * Phase 10 — splits ATHLETE-roled memberships into two client tracks:
 *
 *   - general:  general population. One-to-many content consumption (workouts,
 *               movement snacks, courses); minimal coach interaction.
 *   - athlete:  one-to-one full coaching surface (training plans, messaging,
 *               session-by-session execution, etc.).
 *
 * The two tracks differ in which feature modules an org wants enabled by
 * default. Rather than hard-coding the difference, we let each org define its
 * own default profile per client_type via the new
 * `organisation_client_type_module_defaults` table. When a client is
 * provisioned the relevant profile is read and any module where the per-type
 * default differs from the org-wide setting gets a row in
 * `athlete_module_overrides`.
 *
 * Owner/admin/coach memberships have client_type = NULL — the column only
 * applies to athletes. We enforce this with a CHECK constraint so a bug in the
 * provisioning code can't silently put a coach into a client profile.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TYPE client_type AS ENUM ('general', 'athlete')`.execute(db);

  await db.schema
    .alterTable('organisation_memberships')
    .addColumn('client_type', sql`client_type`, (col) => col)
    .execute();

  // Backfill: any existing ATHLETE-roled membership becomes a 'general' client
  // (the lighter-touch default — orgs that want full coaching will move them
  // manually). Non-athlete roles stay NULL.
  await sql`
    UPDATE organisation_memberships
    SET client_type = 'general'::client_type
    WHERE role = 'athlete'
  `.execute(db);

  // Enforce the role/client_type coupling so the column can never get out of
  // sync with the role.
  await sql`
    ALTER TABLE organisation_memberships
    ADD CONSTRAINT organisation_memberships_client_type_role_chk
    CHECK (
      (role = 'athlete' AND client_type IS NOT NULL)
      OR (role <> 'athlete' AND client_type IS NULL)
    )
  `.execute(db);

  // Per-org, per-client-type, per-module override of the org-wide default. If
  // a row is missing for a (org, type, module), the org-wide setting wins.
  // PK = (organisation_id, client_type, module_key); enforces uniqueness and
  // backs lookups in O(log n).
  await db.schema
    .createTable('organisation_client_type_module_defaults')
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('client_type', sql`client_type`, (col) => col.notNull())
    .addColumn('module_key', 'varchar(64)', (col) =>
      col.notNull().references('modules.key').onDelete('cascade'),
    )
    .addColumn('enabled', 'boolean', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('organisation_client_type_module_defaults_pkey', [
      'organisation_id',
      'client_type',
      'module_key',
    ])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('organisation_client_type_module_defaults').execute();
  await sql`
    ALTER TABLE organisation_memberships
    DROP CONSTRAINT IF EXISTS organisation_memberships_client_type_role_chk
  `.execute(db);
  await db.schema.alterTable('organisation_memberships').dropColumn('client_type').execute();
  await sql`DROP TYPE client_type`.execute(db);
}
