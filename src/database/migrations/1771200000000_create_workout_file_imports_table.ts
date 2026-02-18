import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create enum for file format
  await sql`CREATE TYPE workout_file_format AS ENUM ('fit', 'tcx', 'gpx')`.execute(db);

  // Create enum for import status
  await sql`CREATE TYPE workout_file_import_status AS ENUM ('pending', 'uploading', 'processing', 'completed', 'failed')`.execute(
    db,
  );

  await db.schema
    .createTable('workout_file_imports')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('file_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('file_format', sql`workout_file_format`, (col) => col.notNull())
    .addColumn('file_size_bytes', 'integer', (col) => col.notNull())
    .addColumn('s3_bucket', 'varchar(255)', (col) => col.notNull())
    .addColumn('s3_key', 'varchar(512)', (col) => col.notNull())
    .addColumn('status', sql`workout_file_import_status`, (col) => col.notNull().defaultTo('pending'))
    .addColumn('workout_schedule_id', 'uuid', (col) => col.references('workout_schedules.id').onDelete('set null'))
    .addColumn('workout_execution_id', 'uuid', (col) => col.references('workout_executions.id').onDelete('set null'))
    .addColumn('error_message', 'text')
    .addColumn('processed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_workout_file_imports_user_id')
    .on('workout_file_imports')
    .column('user_id')
    .execute();

  await db.schema.createIndex('idx_workout_file_imports_status').on('workout_file_imports').column('status').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('workout_file_imports').execute();
  await sql`DROP TYPE workout_file_import_status`.execute(db);
  await sql`DROP TYPE workout_file_format`.execute(db);
}
