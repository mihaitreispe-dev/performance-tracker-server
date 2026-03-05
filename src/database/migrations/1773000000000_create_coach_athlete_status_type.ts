import { type Kysely } from 'kysely';

const typeName = 'coach_athlete_status';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createType(typeName).asEnum(['pending', 'active', 'declined', 'removed']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropType(typeName).execute();
}
