import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create injury_type enum
  await db.schema.createType('injury_type').asEnum(['acute', 'chronic', 'overuse']).execute();

  // Add injury-related columns to pain_logs table
  await db.schema
    .alterTable('pain_logs')
    .addColumn('is_injury', 'boolean', (col) => col.defaultTo(false).notNull())
    .addColumn('injury_type', sql`injury_type`)
    .addColumn('expected_recovery_days', 'integer')
    .addColumn('coach_notified_at', 'timestamptz')
    .execute();

  // Create index for finding injuries
  await db.schema
    .createIndex('pain_logs_user_injury_idx')
    .on('pain_logs')
    .columns(['user_id', 'is_injury'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop index
  await db.schema.dropIndex('pain_logs_user_injury_idx').execute();

  // Remove columns
  await db.schema
    .alterTable('pain_logs')
    .dropColumn('is_injury')
    .dropColumn('injury_type')
    .dropColumn('expected_recovery_days')
    .dropColumn('coach_notified_at')
    .execute();

  // Drop injury_type enum
  await db.schema.dropType('injury_type').execute();
}
