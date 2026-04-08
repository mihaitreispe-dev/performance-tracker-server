import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add attached_questionnaire_id column to coaching_messages
  await db.schema
    .alterTable('coaching_messages')
    .addColumn('attached_questionnaire_id', 'uuid', (col) =>
      col.references('questionnaire_instances.id').onDelete('set null'),
    )
    .execute();

  // Create index for messages with attached questionnaires
  await db.schema
    .createIndex('idx_coaching_messages_attached_questionnaire')
    .on('coaching_messages')
    .column('attached_questionnaire_id')
    .where('attached_questionnaire_id', 'is not', null)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_coaching_messages_attached_questionnaire').execute();
  await db.schema.alterTable('coaching_messages').dropColumn('attached_questionnaire_id').execute();
}
