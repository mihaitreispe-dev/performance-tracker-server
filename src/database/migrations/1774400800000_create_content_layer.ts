import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Enums for kind + status of content items, and status of courses.
  await db.schema
    .createType('content_item_kind')
    .asEnum(['snack', 'course_lesson', 'exercise_intro'])
    .execute();

  await db.schema
    .createType('content_item_status')
    .asEnum(['draft', 'upload_pending', 'ready', 'failed'])
    .execute();

  await db.schema.createType('course_status').asEnum(['draft', 'published', 'archived']).execute();

  // 1. content_items — polymorphic store for snacks, course lessons, exercise intros.
  await db.schema
    .createTable('content_items')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('kind', sql`content_item_kind`, (col) => col.notNull())
    .addColumn('title', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('owner_user_id', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('video_s3_bucket', 'varchar(255)')
    .addColumn('video_s3_key', 'varchar(500)')
    .addColumn('video_mime_type', 'varchar(100)')
    .addColumn('thumbnail_s3_bucket', 'varchar(255)')
    .addColumn('thumbnail_s3_key', 'varchar(500)')
    .addColumn('duration_seconds', 'integer')
    .addColumn('status', sql`content_item_status`, (col) => col.notNull().defaultTo('draft'))
    .addColumn('tags', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn('media_convert_job_id', 'varchar(255)')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_content_items_org_kind')
    .on('content_items')
    .columns(['organisation_id', 'kind'])
    .execute();

  // 2. courses — a curated, linear sequence of content items (lessons).
  await db.schema
    .createTable('courses')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('organisation_id', 'uuid', (col) =>
      col.notNull().references('organisations.id').onDelete('cascade'),
    )
    .addColumn('title', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('owner_user_id', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('cover_s3_bucket', 'varchar(255)')
    .addColumn('cover_s3_key', 'varchar(500)')
    .addColumn('status', sql`course_status`, (col) => col.notNull().defaultTo('draft'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex('idx_courses_org').on('courses').column('organisation_id').execute();

  // 3. course_lessons — ordered join between a course and a content item.
  await db.schema
    .createTable('course_lessons')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('course_id', 'uuid', (col) => col.notNull().references('courses.id').onDelete('cascade'))
    .addColumn('content_item_id', 'uuid', (col) =>
      col.notNull().references('content_items.id').onDelete('cascade'),
    )
    .addColumn('sort_order', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_course_lessons_course_order')
    .on('course_lessons')
    .columns(['course_id', 'sort_order'])
    .execute();

  // 4. course_completions — per-athlete completion of a single lesson.
  await db.schema
    .createTable('course_completions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('course_id', 'uuid', (col) => col.notNull().references('courses.id').onDelete('cascade'))
    .addColumn('lesson_id', 'uuid', (col) =>
      col.notNull().references('course_lessons.id').onDelete('cascade'),
    )
    .addColumn('athlete_user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('completed_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('uniq_course_completion', ['lesson_id', 'athlete_user_id'])
    .execute();

  await db.schema
    .createIndex('idx_course_completions_athlete')
    .on('course_completions')
    .columns(['athlete_user_id', 'course_id'])
    .execute();

  // 5. exercise intro video FK — single optional content_item per exercise.
  await db.schema
    .alterTable('exercises')
    .addColumn('intro_content_item_id', 'uuid', (col) =>
      col.references('content_items.id').onDelete('set null'),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('exercises').dropColumn('intro_content_item_id').execute();
  await db.schema.dropTable('course_completions').execute();
  await db.schema.dropTable('course_lessons').execute();
  await db.schema.dropTable('courses').execute();
  await db.schema.dropTable('content_items').execute();
  await db.schema.dropType('course_status').execute();
  await db.schema.dropType('content_item_status').execute();
  await db.schema.dropType('content_item_kind').execute();
}
