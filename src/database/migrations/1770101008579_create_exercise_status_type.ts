import { type Kysely } from 'kysely';

const typeName = 'exercise_status';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createType(typeName)
    .asEnum([
      'draft',
      'upload_pending',
      'upload_done',
      'assets_pending',
      'assets_done',
      'assets_failed',
      'assets_canceled',
    ])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropType(typeName).execute();
}
