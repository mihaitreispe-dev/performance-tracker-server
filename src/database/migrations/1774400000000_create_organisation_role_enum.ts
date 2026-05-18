import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createType('organisation_role').asEnum(['owner', 'admin', 'coach', 'athlete']).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropType('organisation_role').execute();
}
