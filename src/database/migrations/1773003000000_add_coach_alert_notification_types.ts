import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add new notification types for coach alerts
  await sql`ALTER TYPE notification_type ADD VALUE 'coach_alert_missed_workout'`.execute(db);
  await sql`ALTER TYPE notification_type ADD VALUE 'coach_alert_high_pain'`.execute(db);
  await sql`ALTER TYPE notification_type ADD VALUE 'coach_alert_low_compliance'`.execute(db);
  await sql`ALTER TYPE notification_type ADD VALUE 'coach_alert_incomplete_intake'`.execute(db);
  await sql`ALTER TYPE notification_type ADD VALUE 'coach_alert_health_concern'`.execute(db);
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // PostgreSQL doesn't support removing enum values directly
  // This would require recreating the type which is complex
  // For safety, we leave the enum values in place
}
