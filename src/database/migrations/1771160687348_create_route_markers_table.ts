import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('route_markers')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workout_route_id', 'uuid', (col) => col.notNull().references('workout_routes.id').onDelete('cascade'))
    .addColumn('marker_type', 'varchar(16)', (col) => col.notNull())
    .addColumn('marker_number', 'integer', (col) => col.notNull())
    .addColumn('latitude', 'decimal(10, 7)', (col) => col.notNull())
    .addColumn('longitude', 'decimal(10, 7)', (col) => col.notNull())
    .addColumn('elevation_meters', 'decimal(10, 2)')
    .addColumn('recorded_at', 'timestamptz', (col) => col.notNull())
    .addColumn('split_time_seconds', 'integer', (col) => col.notNull())
    .addColumn('cumulative_time_seconds', 'integer', (col) => col.notNull())
    .addColumn('avg_heart_rate', 'integer')
    .addColumn('avg_pace_seconds_per_km', 'integer')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_route_markers_workout_route_id')
    .on('route_markers')
    .column('workout_route_id')
    .execute();

  // Unique constraint to prevent duplicate markers
  await db.schema
    .createIndex('idx_route_markers_unique')
    .on('route_markers')
    .columns(['workout_route_id', 'marker_type', 'marker_number'])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('route_markers').execute();
}
