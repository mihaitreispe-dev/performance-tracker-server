import { type Kysely } from 'kysely';

const typeName = 'cardio_sport_type';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createType(typeName).asEnum(['run', 'cycling', 'swimming']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropType(typeName).execute();
}
