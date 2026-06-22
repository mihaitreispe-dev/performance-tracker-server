import { Kysely, sql } from 'kysely';

/**
 * Exercise model rework:
 *   - `categories` + `exercise_categories` (m2m) — promotes the old free-text
 *     `exercises.category` column to DB-backed reference data, multi-select.
 *     Mirrors the equipment table + join pattern.
 *   - `movement_patterns` + `exercises.movement_pattern_id` (single FK) — a new
 *     biomechanical classification (squat / hinge / push / pull / …).
 *   - Drops `exercises.cues` and retires the `generated_from_cues` voiceover
 *     mode (cues were its only real input; intros replace coaching cues).
 *
 * Both reference tables are GLOBAL (no organisation_id), like equipment /
 * muscle_groups, so RLS doesn't apply. Seeded with canonical sets; UNIQUE(name)
 * keeps the seed idempotent and prevents dupes.
 *
 * The old `exercises.category` text column is left in place (not dropped) so any
 * legacy value survives for reference; the API stops reading/writing it in
 * favour of the m2m categories.
 */

const CATEGORIES = [
  'Strength',
  'Hypertrophy',
  'Power',
  'Olympic Weightlifting',
  'Conditioning',
  'Plyometric',
  'Mobility',
  'Flexibility',
  'Balance',
  'Core',
  'Warm-up',
  'Cool-down',
  'Recovery',
];

// Fundamental human movement patterns (Cook's primal patterns + the
// horizontal/vertical push-pull split used by NASM/ACE), plus an Isolation
// catch-all for single-joint accessory work.
const MOVEMENT_PATTERNS = [
  'Squat',
  'Hinge',
  'Lunge',
  'Horizontal Push',
  'Vertical Push',
  'Horizontal Pull',
  'Vertical Pull',
  'Carry',
  'Rotation / Anti-rotation',
  'Gait / Locomotion',
  'Isolation',
];

export async function up(db: Kysely<unknown>): Promise<void> {
  // --- categories (global reference) + m2m join ---
  await sql`
    CREATE TABLE categories (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE TABLE exercise_categories (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (exercise_id, category_id)
    )
  `.execute(db);
  await sql`CREATE INDEX exercise_categories_exercise_idx ON exercise_categories (exercise_id)`.execute(db);

  // --- movement_patterns (global reference) + single FK on exercises ---
  await sql`
    CREATE TABLE movement_patterns (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    ALTER TABLE exercises
      ADD COLUMN movement_pattern_id UUID NULL REFERENCES movement_patterns(id) ON DELETE SET NULL
  `.execute(db);

  // --- seed reference data ---
  await sql`
    INSERT INTO categories (name)
    SELECT * FROM unnest(${sql.val(CATEGORIES)}::text[])
    ON CONFLICT (name) DO NOTHING
  `.execute(db);
  await sql`
    INSERT INTO movement_patterns (name)
    SELECT * FROM unnest(${sql.val(MOVEMENT_PATTERNS)}::text[])
    ON CONFLICT (name) DO NOTHING
  `.execute(db);

  // --- retire cues + the generated_from_cues voiceover mode ---
  await sql`UPDATE exercises SET voiceover_mode = 'off' WHERE voiceover_mode = 'generated_from_cues'`.execute(db);
  await sql`ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_voiceover_mode_chk`.execute(db);
  await sql`
    ALTER TABLE exercises
      ADD CONSTRAINT exercises_voiceover_mode_chk
      CHECK (voiceover_mode IN ('off', 'recorded'))
  `.execute(db);
  await sql`ALTER TABLE exercises DROP COLUMN IF EXISTS cues`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Restore cues (data not recoverable) + the generated_from_cues mode.
  await sql`ALTER TABLE exercises ADD COLUMN IF NOT EXISTS cues text[] NOT NULL DEFAULT '{}'`.execute(db);
  await sql`ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_voiceover_mode_chk`.execute(db);
  await sql`
    ALTER TABLE exercises
      ADD CONSTRAINT exercises_voiceover_mode_chk
      CHECK (voiceover_mode IN ('off', 'recorded', 'generated_from_cues'))
  `.execute(db);

  await sql`ALTER TABLE exercises DROP COLUMN IF EXISTS movement_pattern_id`.execute(db);
  await sql`DROP TABLE IF EXISTS movement_patterns`.execute(db);
  await sql`DROP TABLE IF EXISTS exercise_categories`.execute(db);
  await sql`DROP TABLE IF EXISTS categories`.execute(db);
}
