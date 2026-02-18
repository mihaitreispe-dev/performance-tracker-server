import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createType('cardio_metric_type')
    .asEnum([
      'heart_rate',
      'power',
      'cadence',
      'pace',
      'breathing_rate',
      'stride_length',
      'vertical_oscillation',
      'ground_contact_balance',
      'elevation',
      'speed',
    ])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropType('cardio_metric_type').execute();
}
