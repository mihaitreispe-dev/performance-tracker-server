import { type Kysely } from 'kysely';

const typeName = 'cardio_step_type';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createType(typeName).asEnum(['warm_up', 'cool_down', 'activity', 'rest']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropType(typeName).execute();
}
