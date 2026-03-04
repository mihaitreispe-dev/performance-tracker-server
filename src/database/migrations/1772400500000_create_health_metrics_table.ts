import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create health metric type enum
  await db.schema
    .createType('health_metric_type')
    .asEnum([
      'hrv',
      'resting_heart_rate',
      'body_battery',
      'readiness_score',
      'strain_score',
      'recovery_score',
      'stress_score',
      'sleep_score',
      'activity_score',
      'vo2_max',
      'respiratory_rate',
      'blood_oxygen',
    ])
    .execute();

  await db.schema
    .createTable('daily_health_metrics')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('metric_date', 'date', (col) => col.notNull())
    .addColumn('metric_type', sql`health_metric_type`, (col) => col.notNull())
    .addColumn('value', 'decimal(10, 2)', (col) => col.notNull())
    .addColumn('unit', 'varchar(20)')
    .addColumn('provider', sql`wearable_provider`, (col) => col.notNull())
    .addColumn('external_id', 'varchar(255)')
    .addColumn('recorded_at', 'timestamptz')
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Unique constraint: one metric per user per date per type per provider
  await db.schema
    .createIndex('idx_health_metrics_unique')
    .on('daily_health_metrics')
    .columns(['user_id', 'metric_date', 'metric_type', 'provider'])
    .unique()
    .execute();

  // Index for date range queries
  await db.schema
    .createIndex('idx_health_metrics_user_date')
    .on('daily_health_metrics')
    .columns(['user_id', 'metric_date'])
    .execute();

  // Index for metric type queries
  await db.schema
    .createIndex('idx_health_metrics_type')
    .on('daily_health_metrics')
    .columns(['user_id', 'metric_type', 'metric_date'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('daily_health_metrics').execute();
  await db.schema.dropType('health_metric_type').execute();
}
