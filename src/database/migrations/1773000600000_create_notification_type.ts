import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TYPE notification_type AS ENUM (
      'message',
      'workout_note',
      'workout_assigned',
      'plan_deployed',
      'invitation_received',
      'invitation_accepted',
      'invitation_declined',
      'workout_completed',
      'workout_missed'
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TYPE notification_type`.execute(db);
}
