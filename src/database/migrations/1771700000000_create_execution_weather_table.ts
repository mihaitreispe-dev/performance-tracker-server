import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('execution_weather')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workout_execution_id', 'uuid', (col) =>
      col.notNull().references('workout_executions.id').onDelete('cascade').unique(),
    )
    .addColumn('latitude', 'decimal(10, 7)', (col) => col.notNull())
    .addColumn('longitude', 'decimal(10, 7)', (col) => col.notNull())
    .addColumn('recorded_at', 'timestamptz', (col) => col.notNull())
    .addColumn('temperature_celsius', 'decimal(5, 2)')
    .addColumn('feels_like_celsius', 'decimal(5, 2)')
    .addColumn('humidity_percent', 'integer')
    .addColumn('wind_speed_kmh', 'decimal(6, 2)')
    .addColumn('wind_direction_degrees', 'integer')
    .addColumn('wind_gusts_kmh', 'decimal(6, 2)')
    .addColumn('precipitation_mm', 'decimal(6, 2)')
    .addColumn('weather_code', 'integer')
    .addColumn('weather_description', 'varchar(100)')
    .addColumn('cloud_cover_percent', 'integer')
    .addColumn('pressure_hpa', 'decimal(7, 2)')
    .addColumn('visibility_meters', 'integer')
    .addColumn('uv_index', 'decimal(4, 2)')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_execution_weather_workout_execution_id')
    .on('execution_weather')
    .column('workout_execution_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('execution_weather').execute();
}
