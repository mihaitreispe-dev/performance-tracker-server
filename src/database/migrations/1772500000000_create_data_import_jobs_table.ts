import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create data import type enum
  await db.schema
    .createType('data_import_type')
    .asEnum(['strava_archive', 'garmin_archive', 'trainingpeaks_archive'])
    .execute();

  // Create data import job status enum
  await db.schema
    .createType('data_import_job_status')
    .asEnum(['pending', 'uploading', 'extracting', 'processing', 'completed', 'failed'])
    .execute();

  await db.schema
    .createTable('data_import_jobs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('import_type', sql`data_import_type`, (col) => col.notNull())
    .addColumn('status', sql`data_import_job_status`, (col) => col.notNull().defaultTo('pending'))
    .addColumn('s3_bucket', 'varchar(255)')
    .addColumn('s3_key', 'varchar(512)')
    .addColumn('file_name', 'varchar(255)')
    .addColumn('file_size_bytes', 'bigint')
    .addColumn('total_items', 'integer')
    .addColumn('processed_items', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('skipped_items', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('failed_items', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('error_message', 'text')
    .addColumn('started_at', 'timestamptz')
    .addColumn('completed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for user's jobs
  await db.schema
    .createIndex('idx_data_import_jobs_user')
    .on('data_import_jobs')
    .columns(['user_id', 'created_at'])
    .execute();

  // Index for pending jobs (for processing queue)
  await db.schema
    .createIndex('idx_data_import_jobs_status')
    .on('data_import_jobs')
    .columns(['status', 'created_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('data_import_jobs').execute();
  await db.schema.dropType('data_import_job_status').execute();
  await db.schema.dropType('data_import_type').execute();
}
