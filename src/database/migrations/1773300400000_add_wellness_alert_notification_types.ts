import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add new notification types for injury/illness alerts
  await sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'coach_alert_new_injury'`.execute(db);
  await sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'coach_alert_new_illness'`.execute(db);
  await sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'coach_alert_ongoing_concern'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Note: PostgreSQL doesn't support removing enum values
  // These would need to be handled through a full type recreation if rollback is needed
}
