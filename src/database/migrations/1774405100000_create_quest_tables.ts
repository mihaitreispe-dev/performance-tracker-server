import { Kysely, sql } from 'kysely';

/**
 * Phase 2 — coach-authored quests.
 *
 *  - quests             : a coach-authored definition (org-scoped). Fans out to
 *                         many athletes and, for weekly quests, many windows.
 *  - quest_assignments  : a per-athlete instance with its own window + progress.
 *                         SNAPSHOTS objective/target/reward/period off the
 *                         definition so editing the def never moves the
 *                         goalposts on a live window (mirrors the XP-ledger
 *                         immutability rationale).
 *
 * Reward XP is paid exactly-once through the existing user_progression_events
 * ledger (source_type='quest_reward', source_id=quest_assignment.id) — see the
 * cron. Both tables self-enable RLS + recreate the verbatim org_isolation policy
 * (the 1774404400000 sweep predates them).
 */
const NEW_TABLES = ['quests', 'quest_assignments'] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE quests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      objective_type TEXT NOT NULL,
      target_value INTEGER NOT NULL,
      period TEXT NOT NULL DEFAULT 'one_off',
      reward_xp INTEGER NOT NULL DEFAULT 0,
      due_date DATE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT quests_objective_chk CHECK (objective_type IN
        ('workouts_completed','snacks_completed','active_days','streak_reached','level_reached','plan_adherence')),
      CONSTRAINT quests_period_chk CHECK (period IN ('one_off','weekly')),
      CONSTRAINT quests_status_chk CHECK (status IN ('active','archived')),
      CONSTRAINT quests_target_chk CHECK (target_value >= 1),
      CONSTRAINT quests_reward_chk CHECK (reward_xp >= 0)
    )
  `.execute(db);
  await sql`CREATE INDEX quests_org_coach_idx ON quests (organisation_id, coach_id)`.execute(db);
  await sql`CREATE INDEX quests_org_active_idx ON quests (organisation_id) WHERE status = 'active'`.execute(db);

  await sql`
    CREATE TABLE quest_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_by_coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      -- snapshot of the definition at assign time
      objective_type TEXT NOT NULL,
      target_value INTEGER NOT NULL,
      reward_xp INTEGER NOT NULL,
      period TEXT NOT NULL,
      progress_value INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      window_start DATE NOT NULL,
      window_end DATE,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT quest_assignments_status_chk CHECK (status IN ('active','completed','expired','archived'))
    )
  `.execute(db);
  // one live assignment per (quest, athlete, window) — idempotent assign + weekly roll
  await sql`
    CREATE UNIQUE INDEX quest_assignments_quest_user_window_uniq
      ON quest_assignments (quest_id, user_id, window_start)
  `.execute(db);
  // award() hot path: a user's active assignments by objective type
  await sql`
    CREATE INDEX quest_assignments_user_active_idx
      ON quest_assignments (user_id, organisation_id, status, objective_type) WHERE status = 'active'
  `.execute(db);
  // cron sweep over expiring / weekly windows
  await sql`CREATE INDEX quest_assignments_window_idx ON quest_assignments (status, window_end)`.execute(db);

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
  await sql`DROP TABLE IF EXISTS quest_assignments CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS quests CASCADE`.execute(db);
}
