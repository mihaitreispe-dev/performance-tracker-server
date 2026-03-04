import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add openwearables to the integration_provider enum
  await sql`ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'openwearables'`.execute(db);
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Note: PostgreSQL doesn't support removing enum values easily
  // This would require recreating the type and all dependent columns
  // For safety, we leave this as a no-op
}
