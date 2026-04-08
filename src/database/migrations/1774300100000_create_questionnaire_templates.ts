import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('questionnaire_templates')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('coach_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('category', sql`questionnaire_category`, (col) => col.notNull().defaultTo('custom'))
    .addColumn('is_archived', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for coach's templates
  await db.schema
    .createIndex('idx_questionnaire_templates_coach_id')
    .on('questionnaire_templates')
    .column('coach_id')
    .execute();

  // Index for filtering by category
  await db.schema
    .createIndex('idx_questionnaire_templates_category')
    .on('questionnaire_templates')
    .column('category')
    .execute();

  // Index for non-archived templates
  await db.schema
    .createIndex('idx_questionnaire_templates_coach_archived')
    .on('questionnaire_templates')
    .columns(['coach_id', 'is_archived'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('questionnaire_templates').execute();
}
