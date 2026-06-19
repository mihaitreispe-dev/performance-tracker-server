import { Kysely, sql } from 'kysely';

/**
 * Slice 2 P2 — Row-Level Security backstop for tenant isolation.
 *
 * Adds a database-level second wall behind the explicit `organisation_id`
 * filtering every repository does by hand. A repo method that forgets the org
 * filter currently leaks across tenants silently; with RLS active, the database
 * refuses to return another org's rows on the authenticated tenant surface.
 *
 * Design — *defense-in-depth backstop*, not a strict gate:
 *   - Every base table carrying `organisation_id` gets one `org_isolation`
 *     policy.
 *   - The policy DEFAULTS TO BYPASS: when neither `app.bypass_rls` nor
 *     `app.current_org` is set on the connection, all rows are visible. This is
 *     what keeps login (resolves api-keys / memberships before the org is
 *     known), public endpoints, Stripe webhooks, cron `*AcrossOrgs` jobs, seeds
 *     and the CLI working with zero changes.
 *   - The request interceptor (RlsInterceptor) flips it to ENFORCE for
 *     authenticated tenant requests by setting `app.bypass_rls='off'` +
 *     `app.current_org=<orgId>` (SET LOCAL, inside the request transaction).
 *   - NULL-org rows stay globally visible (e.g. platform-wide
 *     content_translations) via the explicit `organisation_id IS NULL` arm.
 *
 * Hard constraint: a Postgres SUPERUSER bypasses RLS unconditionally (even
 * FORCE doesn't apply). The app connects as `postgres` today, so this migration
 * is INERT until ops provisions login on the `app_rls` role created here and
 * points `DB_USER` at it. That makes `DB_USER` the real kill-switch:
 * `postgres` => RLS bypassed (today's behaviour), `app_rls` => RLS active.
 *
 * Table discovery is dynamic (every public BASE TABLE with an organisation_id
 * column) so the policy set stays correct as new tenant tables are added — the
 * migration re-run / a follow-up migration picks them up without a hand-kept
 * list.
 */

const ORG_TABLES_QUERY = `
  SELECT c.table_name
  FROM information_schema.columns c
  JOIN information_schema.tables tb
    ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
  WHERE c.table_schema = 'public'
    AND c.column_name = 'organisation_id'
    AND tb.table_type = 'BASE TABLE'
`;

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Non-superuser role the app connects as to actually be subject to RLS.
  //    NOLOGIN + no secret here — ops grants LOGIN + a password out of band so
  //    no credential lands in git. Idempotent: roles are cluster-level.
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
        CREATE ROLE app_rls NOLOGIN;
      END IF;
    END $$;
  `.execute(db);

  // 2. Grants. app_rls is NOT the owner, so RLS applies to it once enabled.
  //    Default privileges cover tables/sequences created later by the migrator.
  await sql`GRANT USAGE ON SCHEMA public TO app_rls`.execute(db);
  await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rls`.execute(db);
  await sql`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rls`.execute(db);
  await sql`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rls
  `.execute(db);
  await sql`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO app_rls
  `.execute(db);

  // 3. Enable RLS + attach the bypass-default org_isolation policy to every
  //    org-tagged base table. FORCE so the table owner is subject to it too
  //    (harmless while the app connects as superuser, correct once it doesn't,
  //    and it means seeds run by the owner must rely on bypass-default — which
  //    they do, since they set no GUC).
  await sql`
    DO $$
    DECLARE t text;
    BEGIN
      FOR t IN ${sql.raw(ORG_TABLES_QUERY)}
      LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS org_isolation ON public.%I', t);
        -- Enforce ONLY when bypass is explicitly 'off'. Anything else bypasses:
        -- NULL (never set - cron/seed/CLI), '' (what a SET LOCAL custom GUC
        -- reverts to after a tenant request tx commits, so a reused pool
        -- connection serving a system/auth request correctly bypasses again),
        -- or 'on'. IS DISTINCT FROM makes the NULL case behave too.
        -- NULLIF guards the uuid cast: empty string would otherwise throw on a
        -- ::uuid cast, and Postgres does not guarantee OR short-circuits past it.
        EXECUTE format($f$
          CREATE POLICY org_isolation ON public.%I FOR ALL
          USING (
            current_setting('app.bypass_rls', true) IS DISTINCT FROM 'off'
            OR organisation_id IS NULL
            OR organisation_id = NULLIF(current_setting('app.current_org', true), '')::uuid
          )
          WITH CHECK (
            current_setting('app.bypass_rls', true) IS DISTINCT FROM 'off'
            OR organisation_id IS NULL
            OR organisation_id = NULLIF(current_setting('app.current_org', true), '')::uuid
          )
        $f$, t);
      END LOOP;
    END $$;
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DO $$
    DECLARE t text;
    BEGIN
      FOR t IN ${sql.raw(ORG_TABLES_QUERY)}
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS org_isolation ON public.%I', t);
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
      END LOOP;
    END $$;
  `.execute(db);

  // Revoke grants + drop the role. DROP fails if anything is still connected as
  // app_rls, so flip DB_USER back to the superuser before rolling back.
  await sql`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM app_rls
  `.execute(db);
  await sql`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE USAGE, SELECT ON SEQUENCES FROM app_rls
  `.execute(db);
  await sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_rls;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM app_rls;
        REVOKE USAGE ON SCHEMA public FROM app_rls;
        DROP ROLE app_rls;
      END IF;
    END $$;
  `.execute(db);
}
