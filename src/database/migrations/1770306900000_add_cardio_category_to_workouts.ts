import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('workouts')
    .addColumn('cardio_category_id', 'uuid', (col) => col.references('cardio_categories.id').onDelete('set null'))
    .execute();

  await db.schema.createIndex('idx_workouts_cardio_category_id').on('workouts').column('cardio_category_id').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('workouts').dropColumn('cardio_category_id').execute();
}
