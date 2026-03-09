import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add per-stream load columns to training_stress_scores
  await db.schema
    .alterTable('training_stress_scores')
    .addColumn('aerobic_load', 'decimal(6, 2)', (col) => col.defaultTo(null))
    .execute();

  await db.schema
    .alterTable('training_stress_scores')
    .addColumn('msk_load', 'decimal(6, 2)', (col) => col.defaultTo(null))
    .execute();

  await db.schema
    .alterTable('training_stress_scores')
    .addColumn('neural_load', 'decimal(6, 2)', (col) => col.defaultTo(null))
    .execute();

  await db.schema
    .alterTable('training_stress_scores')
    .addColumn('sport_type', 'varchar(50)', (col) => col.defaultTo(null))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('training_stress_scores').dropColumn('aerobic_load').execute();
  await db.schema.alterTable('training_stress_scores').dropColumn('msk_load').execute();
  await db.schema.alterTable('training_stress_scores').dropColumn('neural_load').execute();
  await db.schema.alterTable('training_stress_scores').dropColumn('sport_type').execute();
}
