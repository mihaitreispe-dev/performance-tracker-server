import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create enum for prompt types
  await sql`
    CREATE TYPE scheduled_prompt_type AS ENUM (
      'intake_reminder',
      'check_in_request',
      'workout_note_request',
      'custom_prompt'
    )
  `.execute(db);

  // Create enum for schedule frequency
  await sql`
    CREATE TYPE schedule_frequency AS ENUM (
      'once',
      'daily',
      'weekly',
      'specific_days'
    )
  `.execute(db);

  // Create the scheduled prompts table
  await db.schema
    .createTable('coach_scheduled_prompts')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('coach_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('athlete_id', 'uuid', (col) => col.references('users.id').onDelete('cascade')) // NULL = all active athletes
    .addColumn('prompt_type', sql`scheduled_prompt_type`, (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('message', 'text')
    .addColumn('frequency', sql`schedule_frequency`, (col) => col.notNull())
    .addColumn('days_of_week', sql`integer[]`) // For specific_days: 0-6 (Sun-Sat)
    .addColumn('scheduled_time', 'time', (col) => col.notNull()) // Time to send (HH:MM)
    .addColumn('timezone', 'text', (col) => col.notNull()) // IANA timezone
    .addColumn('start_date', 'date', (col) => col.notNull()) // When to start
    .addColumn('end_date', 'date') // When to stop (NULL = no end)
    .addColumn('next_run_at', 'timestamptz', (col) => col.notNull()) // Next scheduled run
    .addColumn('last_sent_at', 'timestamptz') // Last sent time
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for finding prompts by coach
  await db.schema
    .createIndex('idx_coach_scheduled_prompts_coach_id')
    .on('coach_scheduled_prompts')
    .column('coach_id')
    .execute();

  // Index for finding due prompts (enabled and next_run_at <= now)
  await db.schema
    .createIndex('idx_coach_scheduled_prompts_enabled_next_run')
    .on('coach_scheduled_prompts')
    .columns(['enabled', 'next_run_at'])
    .execute();

  // Index for finding prompts targeting specific athlete
  await db.schema
    .createIndex('idx_coach_scheduled_prompts_athlete_id')
    .on('coach_scheduled_prompts')
    .column('athlete_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('coach_scheduled_prompts').execute();
  await sql`DROP TYPE schedule_frequency`.execute(db);
  await sql`DROP TYPE scheduled_prompt_type`.execute(db);
}
