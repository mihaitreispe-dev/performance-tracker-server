import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create race_plans table
  await db.schema
    .createTable('race_plans')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('athlete_race_id', 'uuid', (col) =>
      col.notNull().references('athlete_races.id').onDelete('cascade'),
    )
    .addColumn('race_prediction_id', 'uuid', (col) =>
      col.references('race_predictions.id').onDelete('set null'),
    )
    .addColumn('predicted_finish_time_seconds', 'integer', (col) => col.notNull())
    .addColumn('target_finish_time_seconds', 'integer', (col) => col.defaultTo(null))
    .addColumn('pacing_strategy', 'varchar(50)', (col) => col.notNull().defaultTo('even'))
    .addColumn('negative_split_ratio', 'decimal(4, 3)', (col) => col.defaultTo(null))
    .addColumn('segment_splits', 'jsonb', (col) => col.notNull())
    .addColumn('effort_zones', 'jsonb', (col) => col.notNull())
    .addColumn('energy_management', 'jsonb', (col) => col.notNull())
    .addColumn('fatigue_model', 'jsonb', (col) => col.notNull())
    .addColumn('forecast_temperature_celsius', 'decimal(4, 1)', (col) => col.defaultTo(null))
    .addColumn('forecast_humidity_percent', 'integer', (col) => col.defaultTo(null))
    .addColumn('forecast_wind_speed_kmh', 'decimal(4, 1)', (col) => col.defaultTo(null))
    .addColumn('weather_adjustments', 'jsonb', (col) => col.defaultTo(null))
    .addColumn('warmup_protocol', 'text', (col) => col.notNull())
    .addColumn('race_day_checklist', 'jsonb', (col) => col.notNull())
    .addColumn('key_advice', 'jsonb', (col) => col.notNull())
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('active'))
    .addColumn('plan_version', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(null))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for looking up active plans by user + race
  await db.schema
    .createIndex('race_plans_user_race_status_idx')
    .on('race_plans')
    .columns(['user_id', 'athlete_race_id', 'status'])
    .execute();

  // Index for athlete_race_id queries
  await db.schema
    .createIndex('race_plans_athlete_race_id_idx')
    .on('race_plans')
    .columns(['athlete_race_id'])
    .execute();

  // Index for finding active plans
  await db.schema
    .createIndex('race_plans_status_idx')
    .on('race_plans')
    .columns(['status'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('race_plans').execute();
}
