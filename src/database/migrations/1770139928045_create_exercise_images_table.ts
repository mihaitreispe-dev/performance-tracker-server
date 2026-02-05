import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('exercise_images')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('exercise_id', 'uuid', (col) => col.notNull().references('exercises.id').onDelete('cascade'))
    .addColumn('s3_bucket', 'varchar(255)', (col) => col.notNull())
    .addColumn('s3_key', 'varchar(1024)', (col) => col.notNull())
    .addColumn('position', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex('idx_exercise_images_exercise_id').on('exercise_images').column('exercise_id').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('exercise_images').execute();
}
