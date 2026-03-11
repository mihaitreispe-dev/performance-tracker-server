import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create illness_type enum
  await db.schema
    .createType('illness_type')
    .asEnum(['cold', 'flu', 'stomach', 'fever', 'fatigue', 'covid', 'allergies', 'headache', 'other'])
    .execute();

  // Create illness_logs table
  await db.schema
    .createTable('illness_logs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.references('users.id').onDelete('cascade').notNull())
    .addColumn('illness_type', sql`illness_type`, (col) => col.notNull())
    .addColumn('severity', 'smallint', (col) => col.notNull())
    .addColumn('start_date', 'date', (col) => col.notNull())
    .addColumn('end_date', 'date')
    .addColumn('symptoms', sql`text[]`)
    .addColumn('affects_training', 'boolean', (col) => col.defaultTo(true).notNull())
    .addColumn('notes', 'text')
    .addColumn('coach_notified_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Create indexes
  await db.schema.createIndex('illness_logs_user_id_idx').on('illness_logs').column('user_id').execute();

  await db.schema
    .createIndex('illness_logs_user_start_date_idx')
    .on('illness_logs')
    .columns(['user_id', 'start_date'])
    .execute();

  // Add check constraint for severity (1-10)
  await sql`ALTER TABLE illness_logs ADD CONSTRAINT illness_severity_range CHECK (severity >= 1 AND severity <= 10)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('illness_logs').execute();
  await db.schema.dropType('illness_type').execute();
}
