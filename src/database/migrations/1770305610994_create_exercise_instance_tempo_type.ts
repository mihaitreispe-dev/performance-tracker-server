import { type Kysely } from 'kysely';

const typeName = 'exercise_instance_tempo';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createType(typeName).asEnum(['slow', 'moderate', 'fast', 'explosive']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropType(typeName).execute();
}
