import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TYPE workout_type ADD VALUE IF NOT EXISTS 'run'`.execute(db);
  await sql`ALTER TYPE workout_type ADD VALUE IF NOT EXISTS 'cycling'`.execute(db);
  await sql`ALTER TYPE workout_type ADD VALUE IF NOT EXISTS 'swimming'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Note: PostgreSQL doesn't support removing values from enums directly
  // This would require recreating the enum and all columns using it
}
