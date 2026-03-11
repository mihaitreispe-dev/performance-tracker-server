import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TYPE cardio_metric_type ADD VALUE IF NOT EXISTS 'vertical_ratio'`.execute(db);
  await sql`ALTER TYPE cardio_metric_type ADD VALUE IF NOT EXISTS 'ground_contact_time'`.execute(db);
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Note: PostgreSQL doesn't support removing values from enums directly
  // This would require recreating the enum and all columns using it
}
