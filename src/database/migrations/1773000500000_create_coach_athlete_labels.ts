import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('coach_athlete_labels')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('coach_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('athlete_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('label', 'varchar(100)', (col) => col.notNull())
    .addColumn('color', 'varchar(20)', (col) => col.notNull())
    .addColumn('start_date', 'date', (col) => col.notNull())
    .addColumn('end_date', 'date', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for coach lookups
  await db.schema
    .createIndex('idx_coach_athlete_labels_coach_id')
    .on('coach_athlete_labels')
    .column('coach_id')
    .execute();

  // Index for athlete lookups
  await db.schema
    .createIndex('idx_coach_athlete_labels_athlete_id')
    .on('coach_athlete_labels')
    .column('athlete_id')
    .execute();

  // Composite index for date range queries
  await db.schema
    .createIndex('idx_coach_athlete_labels_athlete_dates')
    .on('coach_athlete_labels')
    .columns(['athlete_id', 'start_date', 'end_date'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('coach_athlete_labels').execute();
}
