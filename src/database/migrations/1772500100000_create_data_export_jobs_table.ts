import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create data export format enum
  await db.schema
    .createType('data_export_format')
    .asEnum(['csv', 'json', 'fit'])
    .execute();

  // Create data export category enum
  await db.schema
    .createType('data_export_category')
    .asEnum([
      'workouts',
      'workout_executions',
      'cardio_metrics',
      'routes',
      'health_metrics',
      'personal_records',
      'training_load',
      'user_settings',
      'sleep',
    ])
    .execute();

  // Create data export job status enum
  await db.schema
    .createType('data_export_job_status')
    .asEnum(['pending', 'processing', 'completed', 'failed', 'expired'])
    .execute();

  await db.schema
    .createTable('data_export_jobs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('format', sql`data_export_format`, (col) => col.notNull())
    .addColumn('categories', sql`data_export_category[]`, (col) => col.notNull())
    .addColumn('status', sql`data_export_job_status`, (col) => col.notNull().defaultTo('pending'))
    .addColumn('s3_bucket', 'varchar(255)')
    .addColumn('s3_key', 'varchar(512)')
    .addColumn('download_url', 'text')
    .addColumn('expires_at', 'timestamptz')
    .addColumn('total_items', 'integer')
    .addColumn('processed_items', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('file_size_bytes', 'bigint')
    .addColumn('error_message', 'text')
    .addColumn('started_at', 'timestamptz')
    .addColumn('completed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for user's export jobs
  await db.schema
    .createIndex('idx_data_export_jobs_user')
    .on('data_export_jobs')
    .columns(['user_id', 'created_at'])
    .execute();

  // Index for pending jobs (for processing queue)
  await db.schema
    .createIndex('idx_data_export_jobs_status')
    .on('data_export_jobs')
    .columns(['status', 'created_at'])
    .execute();

  // Index for expired jobs cleanup
  await db.schema
    .createIndex('idx_data_export_jobs_expires')
    .on('data_export_jobs')
    .columns(['expires_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('data_export_jobs').execute();
  await db.schema.dropType('data_export_job_status').execute();
  await db.schema.dropType('data_export_category').execute();
  await db.schema.dropType('data_export_format').execute();
}
