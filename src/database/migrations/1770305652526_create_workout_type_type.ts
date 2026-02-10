import { type Kysely } from 'kysely';

const typeName = 'workout_type';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createType(typeName)
    .asEnum(['strength', 'cardio', 'flexibility', 'hiit', 'circuit', 'custom'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropType(typeName).execute();
}
