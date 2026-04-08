import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('questionnaire_responses')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('instance_id', 'uuid', (col) =>
      col.notNull().references('questionnaire_instances.id').onDelete('cascade'),
    )
    .addColumn('question_id', 'uuid', (col) => col.notNull()) // Reference to original question (may be deleted)
    .addColumn('question_snapshot', 'jsonb', (col) => col.notNull()) // Full question at response time
    .addColumn('response_value', 'jsonb') // The actual response (type depends on question type)
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for fetching responses by instance
  await db.schema
    .createIndex('idx_questionnaire_responses_instance_id')
    .on('questionnaire_responses')
    .column('instance_id')
    .execute();

  // Unique constraint: one response per question per instance
  await db.schema
    .createIndex('idx_questionnaire_responses_instance_question')
    .on('questionnaire_responses')
    .columns(['instance_id', 'question_id'])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('questionnaire_responses').execute();
}
