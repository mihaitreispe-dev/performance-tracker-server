import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add new notification types for questionnaires
  await sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'questionnaire_sent'`.execute(db);
  await sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'questionnaire_completed'`.execute(db);
  await sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'questionnaire_reminder'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Note: PostgreSQL doesn't support removing enum values
  // The values will remain but will be unused
}
