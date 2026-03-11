import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add session RPE columns to workout_executions table
  await db.schema
    .alterTable('workout_executions')
    .addColumn('session_rpe', 'smallint')
    .addColumn('srpe_tss', 'decimal(6, 2)')
    .addColumn('rpe_collected_at', 'timestamptz')
    .execute();

  // Add check constraint for session_rpe (1-10)
  await sql`ALTER TABLE workout_executions ADD CONSTRAINT session_rpe_range CHECK (session_rpe >= 1 AND session_rpe <= 10)`.execute(
    db,
  );

  // Create rpe_tss_tracking table for correlation analysis
  await db.schema
    .createTable('rpe_tss_tracking')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.references('users.id').onDelete('cascade').notNull())
    .addColumn('workout_execution_id', 'uuid', (col) =>
      col.references('workout_executions.id').onDelete('cascade').notNull(),
    )
    .addColumn('session_rpe', 'smallint', (col) => col.notNull())
    .addColumn('srpe_tss', 'decimal(6, 2)', (col) => col.notNull())
    .addColumn('calculated_tss', 'decimal(6, 2)')
    .addColumn('rpe_tss_ratio', 'decimal(4, 2)')
    .addColumn('accumulated_fatigue_flag', 'boolean', (col) => col.defaultTo(false).notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Create indexes for rpe_tss_tracking
  await db.schema.createIndex('rpe_tss_tracking_user_id_idx').on('rpe_tss_tracking').column('user_id').execute();

  await db.schema
    .createIndex('rpe_tss_tracking_workout_execution_id_idx')
    .on('rpe_tss_tracking')
    .column('workout_execution_id')
    .execute();

  await db.schema
    .createIndex('rpe_tss_tracking_user_created_idx')
    .on('rpe_tss_tracking')
    .columns(['user_id', 'created_at'])
    .execute();

  // Add check constraint for session_rpe in rpe_tss_tracking (1-10)
  await sql`ALTER TABLE rpe_tss_tracking ADD CONSTRAINT rpe_tss_tracking_session_rpe_range CHECK (session_rpe >= 1 AND session_rpe <= 10)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop rpe_tss_tracking table
  await db.schema.dropTable('rpe_tss_tracking').execute();

  // Remove check constraint
  await sql`ALTER TABLE workout_executions DROP CONSTRAINT IF EXISTS session_rpe_range`.execute(db);

  // Remove columns from workout_executions
  await db.schema
    .alterTable('workout_executions')
    .dropColumn('session_rpe')
    .dropColumn('srpe_tss')
    .dropColumn('rpe_collected_at')
    .execute();
}
