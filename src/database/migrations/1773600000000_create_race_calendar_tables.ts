import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create race_events table (cached external race events)
  await db.schema
    .createTable('race_events')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('external_id', 'varchar(255)')
    .addColumn('source', 'varchar(50)', (col) => col.notNull())
    .addColumn('name', 'varchar(500)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('event_type', 'varchar(50)', (col) => col.notNull())
    .addColumn('date', 'date', (col) => col.notNull())
    .addColumn('location_city', 'varchar(255)')
    .addColumn('location_country', 'varchar(100)')
    .addColumn('latitude', 'decimal(10, 8)')
    .addColumn('longitude', 'decimal(11, 8)')
    .addColumn('distance_meters', 'integer')
    .addColumn('elevation_gain_meters', 'integer')
    .addColumn('url', 'text')
    .addColumn('cached_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Create unique constraint on external_id + source
  await db.schema
    .createIndex('idx_race_events_external_source')
    .on('race_events')
    .columns(['external_id', 'source'])
    .unique()
    .execute();

  // Create athlete_races table (athlete's scheduled races)
  await db.schema
    .createTable('athlete_races')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('race_event_id', 'uuid', (col) => col.references('race_events.id').onDelete('set null'))
    .addColumn('manual_name', 'varchar(500)')
    .addColumn('manual_date', 'date')
    .addColumn('manual_event_type', 'varchar(50)')
    .addColumn('manual_distance_meters', 'integer')
    .addColumn('goal_time_seconds', 'integer')
    .addColumn('priority', 'char(1)')
    .addColumn('course_file_path', 'text')
    .addColumn('notes', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Create index on user_id for faster queries
  await db.schema
    .createIndex('idx_athlete_races_user_id')
    .on('athlete_races')
    .column('user_id')
    .execute();

  // Create periodization_plans table
  await db.schema
    .createTable('periodization_plans')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('athlete_race_id', 'uuid', (col) =>
      col.notNull().references('athlete_races.id').onDelete('cascade'),
    )
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('suggested'))
    .addColumn('phases', 'jsonb', (col) => col.notNull())
    .addColumn('created_by', 'varchar(50)', (col) => col.notNull().defaultTo('system'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('modified_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Create unique index on athlete_race_id (one plan per race)
  await db.schema
    .createIndex('idx_periodization_plans_athlete_race_id')
    .on('periodization_plans')
    .column('athlete_race_id')
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('periodization_plans').execute();
  await db.schema.dropTable('athlete_races').execute();
  await db.schema.dropTable('race_events').execute();
}
