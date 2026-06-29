import { Kysely, sql } from 'kysely';

/**
 * Gamified "Journey" progression — Phase 1 MVP.
 *
 * Three per-user-per-org tables backing XP/levels, self-selected goals, and an
 * idempotent XP ledger. Per-user-per-org (one journey per org) keeps this
 * consistent with the whitelabel / RLS tenant model — a user in two orgs has a
 * separate journey in each.
 *
 *  - user_progression        : one row per (user, org); cached xp + level, a
 *                              forgiving day-based streak, avatar cosmetics blob.
 *  - user_goals              : self-selected goals (autonomy). System goal types
 *                              auto-advance on activity; 'custom' is user-managed.
 *  - user_progression_events : append-only XP ledger. The UNIQUE
 *                              (source_type, source_id) is the exactly-once gate
 *                              so a re-finish / offline replay never double-awards.
 *
 * RLS: the dynamic sweep in 1774404400000 only covered tables that existed at
 * that timestamp, so each new org-tagged table here self-enables RLS + recreates
 * the IDENTICAL org_isolation policy (copied verbatim). Inert until DB_USER is
 * pointed at the non-superuser app_rls role.
 */
const NEW_TABLES = ['user_progression', 'user_goals', 'user_progression_events'] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE user_progression (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      -- INTEGER (not BIGINT) so the driver returns a JS number, not a string;
      -- the curve tops out far below 2.1B even at absurd levels.
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      last_active_date DATE,
      streak_grace_remaining INTEGER NOT NULL DEFAULT 1,
      streak_timezone TEXT,
      avatar_state JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX user_progression_user_org_uniq
      ON user_progression (user_id, organisation_id)
  `.execute(db);

  await sql`
    CREATE TABLE user_goals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      goal_type TEXT NOT NULL,
      title TEXT,
      -- INTEGER for clean number marshalling; all MVP goal types are counts.
      target_value INTEGER NOT NULL,
      current_value INTEGER NOT NULL DEFAULT 0,
      unit TEXT,
      period TEXT NOT NULL DEFAULT 'ongoing',
      period_anchor DATE,
      status TEXT NOT NULL DEFAULT 'active',
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT user_goals_type_chk CHECK (goal_type IN ('workouts_completed','snacks_completed','active_days','custom')),
      CONSTRAINT user_goals_period_chk CHECK (period IN ('weekly','monthly','ongoing')),
      CONSTRAINT user_goals_status_chk CHECK (status IN ('active','completed','archived'))
    )
  `.execute(db);
  await sql`CREATE INDEX user_goals_user_org_idx ON user_goals (user_id, organisation_id)`.execute(db);
  await sql`
    CREATE INDEX user_goals_active_idx
      ON user_goals (user_id, organisation_id) WHERE status = 'active'
  `.execute(db);

  await sql`
    CREATE TABLE user_progression_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_id UUID NOT NULL,
      xp_awarded INTEGER NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX user_progression_events_idem_uniq
      ON user_progression_events (source_type, source_id)
  `.execute(db);
  await sql`
    CREATE INDEX user_progression_events_user_idx
      ON user_progression_events (user_id, organisation_id, created_at DESC)
  `.execute(db);

  // Attach the identical org_isolation policy the 1774404400000 sweep applies
  // (that sweep predates these tables). Bypass-by-default; enforced only when
  // app.bypass_rls='off' + app.current_org are set on the connection.
  for (const t of NEW_TABLES) {
    const table = sql.ref(t);
    await sql`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`.execute(db);
    await sql`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`.execute(db);
    await sql`DROP POLICY IF EXISTS org_isolation ON ${table}`.execute(db);
    await sql`
      CREATE POLICY org_isolation ON ${table} FOR ALL
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
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // CASCADE drops the policies + indexes with the tables.
  await sql`DROP TABLE IF EXISTS user_progression_events CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS user_goals CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS user_progression CASCADE`.execute(db);
}
