import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add 'workout' to meal_type enum
  await sql`ALTER TYPE meal_type ADD VALUE 'workout'`.execute(db);

  // Add workout_calories column to daily_nutrition_summaries
  await sql`ALTER TABLE daily_nutrition_summaries ADD COLUMN workout_calories DECIMAL(10,2) NOT NULL DEFAULT 0`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Remove workout_calories column
  await db.schema.alterTable('daily_nutrition_summaries').dropColumn('workout_calories').execute();

  // Note: PostgreSQL doesn't support removing enum values directly
  // This would require recreating the enum type
}
