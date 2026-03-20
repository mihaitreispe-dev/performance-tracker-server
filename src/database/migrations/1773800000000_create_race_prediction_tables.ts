import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create athlete_profile_metrics table
  await db.schema
    .createTable('athlete_profile_metrics')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('birth_date', 'date', (col) => col.defaultTo(null))
    .addColumn('gender', 'varchar(20)', (col) => col.defaultTo(null))
    .addColumn('weight_kg', 'decimal(5, 2)', (col) => col.defaultTo(null))
    .addColumn('height_cm', 'decimal(5, 2)', (col) => col.defaultTo(null))
    .addColumn('current_vdot', 'decimal(4, 1)', (col) => col.defaultTo(null))
    .addColumn('vdot_source', 'varchar(20)', (col) => col.defaultTo(null))
    .addColumn('vdot_calculated_at', 'timestamptz', (col) => col.defaultTo(null))
    .addColumn('years_training', 'integer', (col) => col.defaultTo(null))
    .addColumn('weekly_volume_hours', 'decimal(4, 1)', (col) => col.defaultTo(null))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Unique constraint on user_id (one profile per user)
  await db.schema
    .createIndex('athlete_profile_metrics_user_id_idx')
    .on('athlete_profile_metrics')
    .columns(['user_id'])
    .unique()
    .execute();

  // Create race_predictions table
  await db.schema
    .createTable('race_predictions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('athlete_race_id', 'uuid', (col) => col.references('athlete_races.id').onDelete('cascade').defaultTo(null))
    .addColumn('sport', 'varchar(20)', (col) => col.notNull())
    .addColumn('distance_meters', 'integer', (col) => col.notNull())
    .addColumn('race_date', 'date', (col) => col.defaultTo(null))
    .addColumn('predicted_time_seconds', 'integer', (col) => col.notNull())
    .addColumn('confidence_lower_seconds', 'integer', (col) => col.notNull())
    .addColumn('confidence_upper_seconds', 'integer', (col) => col.notNull())
    .addColumn('confidence_score', 'decimal(3, 2)', (col) => col.notNull())
    .addColumn('target_pace_per_km', 'decimal(6, 2)', (col) => col.defaultTo(null))
    .addColumn('target_power_watts', 'integer', (col) => col.defaultTo(null))
    .addColumn('segment_targets', 'jsonb', (col) => col.defaultTo(null))
    .addColumn('risk_score', 'integer', (col) => col.defaultTo(null))
    .addColumn('risk_factors', 'jsonb', (col) => col.defaultTo(null))
    .addColumn('goal_time_seconds', 'integer', (col) => col.defaultTo(null))
    .addColumn('goal_achievability', 'varchar(20)', (col) => col.defaultTo(null))
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('current'))
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(null))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for user's predictions
  await db.schema
    .createIndex('race_predictions_user_id_idx')
    .on('race_predictions')
    .columns(['user_id'])
    .execute();

  // Index for looking up predictions by athlete_race_id
  await db.schema
    .createIndex('race_predictions_athlete_race_id_idx')
    .on('race_predictions')
    .columns(['athlete_race_id'])
    .execute();

  // Index for finding current predictions for a race
  await db.schema
    .createIndex('race_predictions_user_race_status_idx')
    .on('race_predictions')
    .columns(['user_id', 'athlete_race_id', 'status'])
    .execute();

  // Create historical_race_results table
  await db.schema
    .createTable('historical_race_results')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('athlete_race_id', 'uuid', (col) => col.references('athlete_races.id').onDelete('set null').defaultTo(null))
    .addColumn('race_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('race_date', 'date', (col) => col.notNull())
    .addColumn('sport', 'varchar(20)', (col) => col.notNull())
    .addColumn('distance_meters', 'integer', (col) => col.notNull())
    .addColumn('finish_time_seconds', 'integer', (col) => col.notNull())
    .addColumn('official_result', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('temperature_celsius', 'integer', (col) => col.defaultTo(null))
    .addColumn('humidity_percent', 'integer', (col) => col.defaultTo(null))
    .addColumn('course_elevation_meters', 'integer', (col) => col.defaultTo(null))
    .addColumn('predicted_time_seconds', 'integer', (col) => col.defaultTo(null))
    .addColumn('prediction_error_seconds', 'integer', (col) => col.defaultTo(null))
    .addColumn('prediction_error_percent', 'decimal(5, 2)', (col) => col.defaultTo(null))
    .addColumn('source', 'varchar(20)', (col) => col.notNull().defaultTo('manual'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for user's race history
  await db.schema
    .createIndex('historical_race_results_user_id_idx')
    .on('historical_race_results')
    .columns(['user_id'])
    .execute();

  // Index for user + date queries
  await db.schema
    .createIndex('historical_race_results_user_date_idx')
    .on('historical_race_results')
    .columns(['user_id', 'race_date'])
    .execute();

  // Index for sport + distance queries (for model calibration)
  await db.schema
    .createIndex('historical_race_results_user_sport_distance_idx')
    .on('historical_race_results')
    .columns(['user_id', 'sport', 'distance_meters'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('historical_race_results').execute();
  await db.schema.dropTable('race_predictions').execute();
  await db.schema.dropTable('athlete_profile_metrics').execute();
}
