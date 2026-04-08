import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('questionnaire_instances')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('template_id', 'uuid', (col) => col.references('questionnaire_templates.id').onDelete('set null'))
    .addColumn('relationship_id', 'uuid', (col) =>
      col.notNull().references('coach_athlete_relationships.id').onDelete('cascade'),
    )
    .addColumn('coach_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('athlete_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('message_id', 'uuid', (col) => col.references('coaching_messages.id').onDelete('set null'))
    .addColumn('status', sql`questionnaire_status`, (col) => col.notNull().defaultTo('pending'))
    .addColumn('sent_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('started_at', 'timestamptz')
    .addColumn('completed_at', 'timestamptz')
    .addColumn('expires_at', 'timestamptz')
    .addColumn('template_snapshot', 'jsonb', (col) => col.notNull()) // Full snapshot of template at send time
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for athlete's questionnaires
  await db.schema
    .createIndex('idx_questionnaire_instances_athlete_id')
    .on('questionnaire_instances')
    .column('athlete_id')
    .execute();

  // Index for coach's sent questionnaires
  await db.schema
    .createIndex('idx_questionnaire_instances_coach_id')
    .on('questionnaire_instances')
    .column('coach_id')
    .execute();

  // Index for relationship-based queries
  await db.schema
    .createIndex('idx_questionnaire_instances_relationship_id')
    .on('questionnaire_instances')
    .column('relationship_id')
    .execute();

  // Index for filtering by status
  await db.schema
    .createIndex('idx_questionnaire_instances_status')
    .on('questionnaire_instances')
    .column('status')
    .execute();

  // Index for finding pending questionnaires by athlete
  await db.schema
    .createIndex('idx_questionnaire_instances_athlete_status')
    .on('questionnaire_instances')
    .columns(['athlete_id', 'status'])
    .execute();

  // Index for template-based queries (comparing responses over time)
  await db.schema
    .createIndex('idx_questionnaire_instances_template_athlete')
    .on('questionnaire_instances')
    .columns(['template_id', 'athlete_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('questionnaire_instances').execute();
}
