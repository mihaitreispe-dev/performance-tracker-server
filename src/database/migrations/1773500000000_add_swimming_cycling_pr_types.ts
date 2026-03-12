import type { Kysely } from 'kysely';
import { sql } from 'kysely';

const typeName = 'personal_record_type';

// New enum values for swimming and cycling
const newValues = [
  // Swimming distances
  'fastest_400m',
  'fastest_800m',
  'fastest_1500m',
  'fastest_1900m', // Half Ironman swim
  // Cycling distances
  'fastest_20k',
  'fastest_40k',
  'fastest_90k', // Half Ironman bike
  'fastest_100k',
  'fastest_180k', // Ironman bike
];

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add new enum values for swimming and cycling PR types
  for (const value of newValues) {
    await sql`ALTER TYPE ${sql.raw(typeName)} ADD VALUE IF NOT EXISTS ${sql.lit(value)}`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // PostgreSQL doesn't support removing enum values easily
  // Would need to recreate the type, which is complex and not recommended
  // Leaving this as a no-op for safety
}
