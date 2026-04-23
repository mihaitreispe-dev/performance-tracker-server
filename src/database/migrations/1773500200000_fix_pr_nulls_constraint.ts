import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Clean up any duplicate records FIRST - keep only the best value for each unique combination
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

  // Drop the old unique constraint
  await sql`ALTER TABLE personal_records DROP CONSTRAINT IF EXISTS personal_records_user_type_exercise_workout_unique`.execute(
    db,
  );

  // Create new unique constraint with NULLS NOT DISTINCT so that NULL values are treated as equal
  await sql`ALTER TABLE personal_records ADD CONSTRAINT personal_records_user_type_exercise_workout_unique
    UNIQUE NULLS NOT DISTINCT (user_id, record_type, exercise_id, workout_type)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Recreate without NULLS NOT DISTINCT
  await sql`ALTER TABLE personal_records DROP CONSTRAINT IF EXISTS personal_records_user_type_exercise_workout_unique`.execute(
    db,
  );
  await sql`ALTER TABLE personal_records ADD CONSTRAINT personal_records_user_type_exercise_workout_unique
    UNIQUE (user_id, record_type, exercise_id, workout_type)`.execute(db);
}
