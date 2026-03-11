import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TYPE wearable_data_category ADD VALUE IF NOT EXISTS 'activity'`.execute(db);
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Note: PostgreSQL doesn't support removing values from enums directly
  // This would require recreating the enum and all columns using it
}
