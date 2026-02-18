import { type Kysely } from 'kysely';

const typeName = 'personal_record_type';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createType(typeName)
    .asEnum([
      'max_weight',
      'max_reps',
      'max_volume_set',
      'fastest_1k',
      'fastest_5k',
      'fastest_10k',
      'fastest_half_marathon',
      'fastest_marathon',
      'fastest_km_split',
      'fastest_mile_split',
      'longest_distance',
      'max_elevation_gain',
      'longest_duration',
    ])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropType(typeName).execute();
}
