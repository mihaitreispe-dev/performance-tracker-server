import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('exercises')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('cues', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn('visibility', sql`exercise_visibility`, (col) => col.notNull().defaultTo('private'))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('picture_s3_bucket', 'text')
    .addColumn('picture_s3_key', 'text')
    .addColumn('video_s3_bucket', 'text')
    .addColumn('video_s3_key', 'text')
    .addColumn('video_mime_type', 'varchar(100)')
    .addColumn('status', sql`exercise_status`, (col) => col.notNull().defaultTo('draft'))
    .addColumn('media_convert_job_id', 'varchar(255)')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex('idx_exercises_user_id').on('exercises').column('user_id').execute();
  await db.schema.createIndex('idx_exercises_visibility').on('exercises').column('visibility').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('exercises').execute();
}
