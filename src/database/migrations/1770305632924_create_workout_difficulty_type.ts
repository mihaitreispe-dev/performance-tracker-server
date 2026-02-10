import { type Kysely } from 'kysely';

const typeName = 'workout_difficulty';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createType(typeName).asEnum(['easy', 'moderate', 'hard', 'extreme']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropType(typeName).execute();
}
