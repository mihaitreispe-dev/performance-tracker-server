import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createType('wearable_data_category').asEnum(['workouts', 'sleep', 'health_metrics']).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropType('wearable_data_category').execute();
}
