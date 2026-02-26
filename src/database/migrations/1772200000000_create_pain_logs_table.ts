import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create body_part enum type
  await db.schema
    .createType('body_part')
    .asEnum([
      'head',
      'neck',
      'left_shoulder',
      'right_shoulder',
      'left_upper_arm',
      'right_upper_arm',
      'left_elbow',
      'right_elbow',
      'left_forearm',
      'right_forearm',
      'left_wrist',
      'right_wrist',
      'left_hand',
      'right_hand',
      'chest',
      'upper_back',
      'lower_back',
      'abdomen',
      'left_hip',
      'right_hip',
      'left_glute',
      'right_glute',
      'left_thigh',
      'right_thigh',
      'left_hamstring',
      'right_hamstring',
      'left_knee',
      'right_knee',
      'left_shin',
      'right_shin',
      'left_calf',
      'right_calf',
      'left_ankle',
      'right_ankle',
      'left_foot',
      'right_foot',
      'left_heel',
      'right_heel',
      'left_arch',
      'right_arch',
      'left_toes',
      'right_toes',
    ])
    .execute();

  // Create body_view enum type
  await db.schema.createType('body_view').asEnum(['front', 'back', 'left_foot', 'right_foot']).execute();

  // Create pain_trend enum type
  await db.schema.createType('pain_trend').asEnum(['decreasing', 'constant', 'increasing']).execute();

  // Create pain_logs table
  await db.schema
    .createTable('pain_logs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.references('users.id').onDelete('cascade').notNull())
    .addColumn('workout_execution_id', 'uuid', (col) =>
      col.references('workout_executions.id').onDelete('cascade').notNull(),
    )
    .addColumn('body_part', sql`body_part`, (col) => col.notNull())
    .addColumn('body_view', sql`body_view`, (col) => col.notNull())
    .addColumn('pain_level', 'integer', (col) => col.notNull())
    .addColumn('pain_duration_start', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('pain_duration_end', 'integer', (col) => col.notNull().defaultTo(100))
    .addColumn('pain_trend', sql`pain_trend`, (col) => col.notNull().defaultTo('constant'))
    .addColumn('notes', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Create indexes
  await db.schema.createIndex('pain_logs_user_id_idx').on('pain_logs').column('user_id').execute();

  await db.schema
    .createIndex('pain_logs_workout_execution_id_idx')
    .on('pain_logs')
    .column('workout_execution_id')
    .execute();

  // Add check constraint for pain_level (1-10)
  await sql`ALTER TABLE pain_logs ADD CONSTRAINT pain_level_range CHECK (pain_level >= 1 AND pain_level <= 10)`.execute(
    db,
  );

  // Add check constraint for pain_duration_start (0-100)
  await sql`ALTER TABLE pain_logs ADD CONSTRAINT pain_duration_start_range CHECK (pain_duration_start >= 0 AND pain_duration_start <= 100)`.execute(
    db,
  );

  // Add check constraint for pain_duration_end (0-100)
  await sql`ALTER TABLE pain_logs ADD CONSTRAINT pain_duration_end_range CHECK (pain_duration_end >= 0 AND pain_duration_end <= 100)`.execute(
    db,
  );

  // Add check constraint for duration order
  await sql`ALTER TABLE pain_logs ADD CONSTRAINT pain_duration_order CHECK (pain_duration_end >= pain_duration_start)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('pain_logs').execute();
  await db.schema.dropType('pain_trend').execute();
  await db.schema.dropType('body_view').execute();
  await db.schema.dropType('body_part').execute();
}
