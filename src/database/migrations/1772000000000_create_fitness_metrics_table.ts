import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('fitness_metrics')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('metric_type', 'varchar(50)', (col) => col.notNull()) // vo2_max, lthr, ltp, ftp, rhr
    .addColumn('value', 'decimal(10, 2)', (col) => col.notNull())
    .addColumn('confidence', 'decimal(3, 2)', (col) => col.defaultTo(null)) // 0.00 to 1.00
    .addColumn('source_workout_id', 'uuid', (col) => col.references('workout_executions.id').onDelete('set null'))
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(null))
    .addColumn('calculated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for querying user metrics by type and date
  await db.schema
    .createIndex('fitness_metrics_user_type_date_idx')
    .on('fitness_metrics')
    .columns(['user_id', 'metric_type', 'calculated_at'])
    .execute();

  // Index for latest metrics lookup
  await db.schema
    .createIndex('fitness_metrics_user_calculated_idx')
    .on('fitness_metrics')
    .columns(['user_id', 'calculated_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('fitness_metrics').execute();
}
