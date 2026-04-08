import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create food_source enum type
  await db.schema.createType('food_source').asEnum(['usda', 'open_food_facts', 'user_created']).execute();

  // Create meal_type enum type
  await db.schema.createType('meal_type').asEnum(['breakfast', 'lunch', 'dinner', 'snack']).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropType('meal_type').execute();
  await db.schema.dropType('food_source').execute();
}
