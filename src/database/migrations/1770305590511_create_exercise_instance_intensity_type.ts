import { type Kysely } from 'kysely';

const typeName = 'exercise_instance_intensity';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createType(typeName).asEnum(['low', 'moderate', 'high', 'max']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropType(typeName).execute();
}
