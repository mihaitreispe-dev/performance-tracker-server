import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create question type enum
  await sql`
    CREATE TYPE question_type AS ENUM (
      'single_choice',
      'multi_choice',
      'rating_scale',
      'slider',
      'short_text',
      'long_text',
      'yes_no',
      'date',
      'number',
      'body_part',
      'rpe',
      'mood'
    )
  `.execute(db);

  // Create questionnaire instance status enum
  await sql`
    CREATE TYPE questionnaire_status AS ENUM (
      'pending',
      'in_progress',
      'completed',
      'expired'
    )
  `.execute(db);

  // Create questionnaire template category enum
  await sql`
    CREATE TYPE questionnaire_category AS ENUM (
      'wellness',
      'recovery',
      'training',
      'injury',
      'nutrition',
      'mental',
      'general',
      'custom'
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TYPE IF EXISTS questionnaire_category`.execute(db);
  await sql`DROP TYPE IF EXISTS questionnaire_status`.execute(db);
  await sql`DROP TYPE IF EXISTS question_type`.execute(db);
}
