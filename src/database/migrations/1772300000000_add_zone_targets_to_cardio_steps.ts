import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add zone columns to cardio_steps table
  await db.schema
    .alterTable('cardio_steps')
    // HR zone reference
    .addColumn('hr_zone', 'integer')
    // Power targets (watts)
    .addColumn('power_min', 'integer')
    .addColumn('power_max', 'integer')
    .addColumn('power_zone', 'integer')
    // Pace targets (seconds per km)
    .addColumn('pace_min', 'integer')
    .addColumn('pace_max', 'integer')
    .addColumn('pace_zone', 'integer')
    // RPE targets (1-10 scale)
    .addColumn('rpe_min', 'integer')
    .addColumn('rpe_max', 'integer')
    .addColumn('rpe_zone', 'integer')
    .execute();

  // Add zone columns to user_settings table
  await db.schema
    .alterTable('user_settings')
    .addColumn('power_zones', 'jsonb')
    .addColumn('pace_zones', 'jsonb')
    .addColumn('rpe_zones', 'jsonb')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Remove zone columns from cardio_steps
  await db.schema
    .alterTable('cardio_steps')
    .dropColumn('hr_zone')
    .dropColumn('power_min')
    .dropColumn('power_max')
    .dropColumn('power_zone')
    .dropColumn('pace_min')
    .dropColumn('pace_max')
    .dropColumn('pace_zone')
    .dropColumn('rpe_min')
    .dropColumn('rpe_max')
    .dropColumn('rpe_zone')
    .execute();

  // Remove zone columns from user_settings
  await db.schema
    .alterTable('user_settings')
    .dropColumn('power_zones')
    .dropColumn('pace_zones')
    .dropColumn('rpe_zones')
    .execute();
}
