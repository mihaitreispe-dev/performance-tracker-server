import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('load_model_parameters')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade').unique())

    // Time constants (personalizable via Bayesian learning)
    .addColumn('aerobic_ctl_decay', 'decimal(4, 1)', (col) => col.notNull().defaultTo(42))
    .addColumn('aerobic_atl_decay', 'decimal(4, 1)', (col) => col.notNull().defaultTo(7))
    .addColumn('msk_ctl_decay', 'decimal(4, 1)', (col) => col.notNull().defaultTo(21))
    .addColumn('msk_atl_decay', 'decimal(4, 1)', (col) => col.notNull().defaultTo(5))
    .addColumn('neural_ctl_decay', 'decimal(4, 1)', (col) => col.notNull().defaultTo(10))
    .addColumn('neural_atl_decay', 'decimal(4, 1)', (col) => col.notNull().defaultTo(3))

    // Sport scaling coefficients
    .addColumn('run_aerobic_coef', 'decimal(3, 2)', (col) => col.notNull().defaultTo(1.0))
    .addColumn('bike_aerobic_coef', 'decimal(3, 2)', (col) => col.notNull().defaultTo(0.85))
    .addColumn('swim_aerobic_coef', 'decimal(3, 2)', (col) => col.notNull().defaultTo(0.7))
    .addColumn('strength_aerobic_coef', 'decimal(3, 2)', (col) => col.notNull().defaultTo(0.3))

    // Recovery journal weights
    .addColumn('w_sleep', 'decimal(3, 2)', (col) => col.notNull().defaultTo(0.3))
    .addColumn('w_alcohol', 'decimal(3, 2)', (col) => col.notNull().defaultTo(0.2))
    .addColumn('w_stress', 'decimal(3, 2)', (col) => col.notNull().defaultTo(0.15))

    // Bayesian learning state
    .addColumn('parameter_confidence', 'decimal(3, 2)', (col) => col.notNull().defaultTo(0))
    .addColumn('data_points_used', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('last_update_date', 'date', (col) => col.defaultTo(null))

    // Rolling prediction accuracy
    .addColumn('mae_7day', 'decimal(4, 2)', (col) => col.defaultTo(null))
    .addColumn('mae_30day', 'decimal(4, 2)', (col) => col.defaultTo(null))

    // Parameter history for rollback (last 10 snapshots)
    .addColumn('parameter_history', 'jsonb', (col) => col.notNull().defaultTo('[]'))

    // Error tracking (last 90 days of prediction errors)
    .addColumn('prediction_errors', 'jsonb', (col) => col.notNull().defaultTo('[]'))

    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for user lookup
  await db.schema
    .createIndex('load_model_parameters_user_idx')
    .on('load_model_parameters')
    .columns(['user_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('load_model_parameters').execute();
}
