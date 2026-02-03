import { type Kysely } from 'kysely';

const typeName = 'exercise_visibility';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createType(typeName).asEnum(['private', 'public']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropType(typeName).execute();
}
