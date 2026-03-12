import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Drop the old unique constraint that doesn't include workout_type
  // This constraint allowed duplicate cardio PRs because NULL values are distinct
  await sql`ALTER TABLE personal_records DROP CONSTRAINT IF EXISTS uq_personal_records_user_type_exercise`.execute(db);

  // Clean up any duplicate records - keep only the best value for each unique combination
  // For time-based records (FASTEST_*), keep the lowest value
  // For other records, keep the highest value
  await sql`
    DELETE FROM personal_records p1
    WHERE EXISTS (
      SELECT 1 FROM personal_records p2
      WHERE p2.user_id = p1.user_id
        AND p2.record_type = p1.record_type
        AND COALESCE(p2.exercise_id::text, '') = COALESCE(p1.exercise_id::text, '')
        AND COALESCE(p2.workout_type::text, '') = COALESCE(p1.workout_type::text, '')
        AND p2.id != p1.id
        AND (
          -- For time-based records, lower is better
          (p1.record_type::text LIKE 'fastest_%' AND p2.value < p1.value)
          OR
          -- For other records, higher is better
          (p1.record_type::text NOT LIKE 'fastest_%' AND p2.value > p1.value)
        )
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Recreate the old constraint (but this would likely fail if there are workout_type variations)
  // This is a one-way migration
}
