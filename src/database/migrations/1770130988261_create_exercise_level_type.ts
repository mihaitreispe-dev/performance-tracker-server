import { type Kysely } from 'kysely';

const typeName = 'exercise_level';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createType(typeName).asEnum(['beginner', 'intermediate', 'advanced']).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropType(typeName).execute();
}
