import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('questionnaire_questions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('template_id', 'uuid', (col) =>
      col.notNull().references('questionnaire_templates.id').onDelete('cascade'),
    )
    .addColumn('question_text', 'text', (col) => col.notNull())
    .addColumn('question_type', sql`question_type`, (col) => col.notNull())
    .addColumn('is_required', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('order_index', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('config', 'jsonb') // Type-specific configuration (options, min/max, labels, etc.)
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for fetching questions by template
  await db.schema
    .createIndex('idx_questionnaire_questions_template_id')
    .on('questionnaire_questions')
    .column('template_id')
    .execute();

  // Index for ordering questions
  await db.schema
    .createIndex('idx_questionnaire_questions_template_order')
    .on('questionnaire_questions')
    .columns(['template_id', 'order_index'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('questionnaire_questions').execute();
}
