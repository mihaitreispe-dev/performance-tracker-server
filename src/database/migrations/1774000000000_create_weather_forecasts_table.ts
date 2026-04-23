import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create weather_forecasts table
  await db.schema
    .createTable('weather_forecasts')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('athlete_race_id', 'uuid', (col) => col.notNull().references('athlete_races.id').onDelete('cascade'))
    .addColumn('latitude', 'decimal(10, 8)', (col) => col.notNull())
    .addColumn('longitude', 'decimal(11, 8)', (col) => col.notNull())
    .addColumn('race_date', 'date', (col) => col.notNull())
    .addColumn('race_start_time', 'time', (col) => col.defaultTo(null))
    .addColumn('forecast_date', 'timestamptz', (col) => col.notNull())
    .addColumn('hourly_forecasts', 'jsonb', (col) => col.notNull())
    .addColumn('race_hour_temperature_celsius', 'decimal(4, 1)', (col) => col.defaultTo(null))
    .addColumn('race_hour_humidity_percent', 'integer', (col) => col.defaultTo(null))
    .addColumn('race_hour_wind_speed_kmh', 'decimal(4, 1)', (col) => col.defaultTo(null))
    .addColumn('race_hour_conditions', 'varchar(100)', (col) => col.defaultTo(null))
    .addColumn('api_provider', 'varchar(50)', (col) => col.notNull().defaultTo('openweather'))
    .addColumn('forecast_confidence', 'varchar(20)', (col) => col.notNull().defaultTo('medium'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for looking up forecasts by athlete_race_id
  await db.schema
    .createIndex('weather_forecasts_athlete_race_id_idx')
    .on('weather_forecasts')
    .columns(['athlete_race_id'])
    .execute();

  // Index for finding recent forecasts
  await db.schema
    .createIndex('weather_forecasts_race_id_forecast_date_idx')
    .on('weather_forecasts')
    .columns(['athlete_race_id', 'forecast_date'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('weather_forecasts').execute();
}
