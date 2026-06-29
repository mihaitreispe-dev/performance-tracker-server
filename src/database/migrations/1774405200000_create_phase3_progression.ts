import { Kysely, sql } from 'kysely';

/**
 * Phase 3 — seasons (parallel points), unlockable worlds, cohort leaderboards.
 *
 *  - seasons       : a GLOBAL system reference calendar (no organisation_id, no
 *                    RLS — like platform content). Defines time-boxed cycles
 *                    with a theme that drives the seasonal cosmetic ladder + the
 *                    world art. "Season points" are NOT stored here or anywhere —
 *                    they're derived on read by summing the XP ledger over the
 *                    season's [starts_on, ends_on] window. Lifetime xp/level are
 *                    never reset.
 *  - user_unlocks  : the generic non-level cosmetic-unlock ledger (org-scoped).
 *                    Level cosmetics stay deterministic (unlockLevel <= level, no
 *                    row); seasonal + leaderboard cosmetics are EARNED and land
 *                    here. Idempotent grants via the UNIQUE. Self-enables RLS +
 *                    recreates the verbatim org_isolation policy (the 1774404400000
 *                    sweep predates it).
 *
 * Seeds three monthly seasons around the current date so the feature has a live
 * "active" season immediately; the seasons cron rolls status by date thereafter.
 */
const ORG_TABLES = ['user_unlocks'] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  // ---- seasons (global reference, no RLS) ---------------------------------
  await sql`
    CREATE TABLE seasons (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      theme TEXT NOT NULL,
      starts_on DATE NOT NULL,
      ends_on DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'upcoming',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT seasons_status_chk CHECK (status IN ('upcoming','active','ended')),
      CONSTRAINT seasons_window_chk CHECK (ends_on >= starts_on)
    )
  `.execute(db);
  await sql`CREATE INDEX seasons_status_idx ON seasons (status)`.execute(db);
  await sql`CREATE INDEX seasons_window_idx ON seasons (starts_on, ends_on)`.execute(db);

  // Seed three monthly seasons. June 2026 is live (today is in-window); the cron
  // flips July/Aug to 'active' on their start and 'ends' June when it lapses.
  await sql`
    INSERT INTO seasons (slug, name, theme, starts_on, ends_on, status) VALUES
      ('2026-06-meadow', 'Meadow Bloom',  'meadow', DATE '2026-06-01', DATE '2026-06-30', 'active'),
      ('2026-07-coast',  'Coastal Calm',  'coast',  DATE '2026-07-01', DATE '2026-07-31', 'upcoming'),
      ('2026-08-summit', 'Summit Ascent', 'summit', DATE '2026-08-01', DATE '2026-08-31', 'upcoming')
  `.execute(db);

  // ---- user_unlocks (org-scoped, RLS) -------------------------------------
  await sql`
    CREATE TABLE user_unlocks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      cosmetic_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'season',
      season_id UUID REFERENCES seasons(id) ON DELETE SET NULL,
      unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT user_unlocks_source_chk CHECK (source IN ('season','leaderboard','other'))
    )
  `.execute(db);
  // one row per (user, org, cosmetic) — re-running award()/cron never double-grants
  await sql`
    CREATE UNIQUE INDEX user_unlocks_user_cosmetic_uniq
      ON user_unlocks (user_id, organisation_id, cosmetic_id)
  `.execute(db);
  await sql`CREATE INDEX user_unlocks_user_idx ON user_unlocks (user_id, organisation_id)`.execute(db);

  for (const t of ORG_TABLES) {
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
  await sql`DROP TABLE IF EXISTS user_unlocks CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS seasons CASCADE`.execute(db);
}
