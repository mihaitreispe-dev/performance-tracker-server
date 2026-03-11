import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add workout_type column to personal_records table
  await db.schema
    .alterTable('personal_records')
    .addColumn('workout_type', sql`workout_type`, (col) => col.defaultTo(null))
    .execute();

  // Add workout_type column to personal_record_history table
  await db.schema
    .alterTable('personal_record_history')
    .addColumn('workout_type', sql`workout_type`, (col) => col.defaultTo(null))
    .execute();

  // Update unique constraint to include workout_type
  // First drop the old constraint
  await sql`ALTER TABLE personal_records DROP CONSTRAINT IF EXISTS personal_records_user_type_exercise_unique`.execute(db);

  // Create new unique constraint including workout_type
  await sql`ALTER TABLE personal_records ADD CONSTRAINT personal_records_user_type_exercise_workout_unique
    UNIQUE (user_id, record_type, exercise_id, workout_type)`.execute(db);

  // Create index for querying by workout_type
  await db.schema
    .createIndex('personal_records_workout_type_idx')
    .on('personal_records')
    .column('workout_type')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop the index
  await db.schema.dropIndex('personal_records_workout_type_idx').execute();

  // Drop the new constraint and recreate the old one
  await sql`ALTER TABLE personal_records DROP CONSTRAINT IF EXISTS personal_records_user_type_exercise_workout_unique`.execute(db);
  await sql`ALTER TABLE personal_records ADD CONSTRAINT personal_records_user_type_exercise_unique
    UNIQUE (user_id, record_type, exercise_id)`.execute(db);

  // Remove workout_type columns
  await db.schema.alterTable('personal_records').dropColumn('workout_type').execute();
  await db.schema.alterTable('personal_record_history').dropColumn('workout_type').execute();
}
