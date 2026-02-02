import { type Kysely } from 'kysely';

const typeName = 'user_roles';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createType(typeName).asEnum(['admin', 'user', 'coach']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropType(typeName);
}
