import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('workout_routes')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workout_execution_id', 'uuid', (col) =>
      col.notNull().references('workout_executions.id').onDelete('cascade').unique(),
    )
    .addColumn('route_geojson', 'jsonb', (col) => col.notNull())
    .addColumn('total_distance_meters', 'decimal(12, 2)', (col) => col.notNull())
    .addColumn('elevation_gain_meters', 'decimal(10, 2)')
    .addColumn('elevation_loss_meters', 'decimal(10, 2)')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_workout_routes_workout_execution_id')
    .on('workout_routes')
    .column('workout_execution_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('workout_routes').execute();
}
