import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('cardio_steps')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('type', sql`cardio_step_type`, (col) => col.notNull())
    .addColumn('mode', sql`cardio_step_mode`, (col) => col.notNull())
    .addColumn('duration', 'integer')
    .addColumn('distance', 'integer')
    .addColumn('hr_min', 'integer')
    .addColumn('hr_max', 'integer')
    .addColumn('notes', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      'chk_cardio_steps_duration_or_distance',
      sql`(mode = 'duration' AND duration IS NOT NULL) OR (mode = 'distance' AND distance IS NOT NULL)`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('cardio_steps').execute();
}
