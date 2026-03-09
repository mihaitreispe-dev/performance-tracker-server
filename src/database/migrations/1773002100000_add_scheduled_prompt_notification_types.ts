import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add new notification types for scheduled prompts
  await sql`ALTER TYPE notification_type ADD VALUE 'intake_reminder'`.execute(db);
  await sql`ALTER TYPE notification_type ADD VALUE 'check_in_request'`.execute(db);
  await sql`ALTER TYPE notification_type ADD VALUE 'workout_note_request'`.execute(db);
  await sql`ALTER TYPE notification_type ADD VALUE 'scheduled_prompt'`.execute(db);
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // PostgreSQL doesn't support removing enum values directly
  // This would require recreating the type which is complex
  // For safety, we leave the enum values in place
}
