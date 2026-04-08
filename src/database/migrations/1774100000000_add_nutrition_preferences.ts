import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create GI sensitivity enum type
  await db.schema.createType('gi_sensitivity_level').asEnum(['low', 'moderate', 'high']).execute();

  // Create caffeine tolerance enum type
  await db.schema.createType('caffeine_tolerance_level').asEnum(['none', 'low', 'moderate', 'high']).execute();

  // Add nutrition preference columns to athlete_profile_metrics table
  await db.schema
    .alterTable('athlete_profile_metrics')
    .addColumn('sweat_rate_ml_per_hour', 'decimal(6, 1)')
    .addColumn('gi_sensitivity', sql`gi_sensitivity_level`)
    .addColumn('preferred_carb_sources', 'jsonb')
    .addColumn('caffeine_tolerance', sql`caffeine_tolerance_level`)
    .execute();

  // Add check constraint for sweat_rate_ml_per_hour (reasonable range 200-3000 ml/hour)
  await sql`ALTER TABLE athlete_profile_metrics ADD CONSTRAINT sweat_rate_range CHECK (sweat_rate_ml_per_hour >= 200 AND sweat_rate_ml_per_hour <= 3000)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Remove check constraint
  await sql`ALTER TABLE athlete_profile_metrics DROP CONSTRAINT IF EXISTS sweat_rate_range`.execute(db);

  // Remove columns from athlete_profile_metrics
  await db.schema
    .alterTable('athlete_profile_metrics')
    .dropColumn('sweat_rate_ml_per_hour')
    .dropColumn('gi_sensitivity')
    .dropColumn('preferred_carb_sources')
    .dropColumn('caffeine_tolerance')
    .execute();

  // Drop enum types
  await db.schema.dropType('caffeine_tolerance_level').execute();
  await db.schema.dropType('gi_sensitivity_level').execute();
}
