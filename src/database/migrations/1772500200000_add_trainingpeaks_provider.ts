import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add TRAININGPEAKS to integration_provider enum
  await sql`ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'trainingpeaks'`.execute(db);

  // Add TRAININGPEAKS to workout_execution_source enum
  await sql`ALTER TYPE workout_execution_source ADD VALUE IF NOT EXISTS 'trainingpeaks'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Note: PostgreSQL doesn't support removing enum values
  // In production, would need to recreate the type
}
