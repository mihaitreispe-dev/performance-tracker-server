import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Index for workout_executions lookups by user and completion status
  await db.schema
    .createIndex('idx_workout_executions_user_completed')
    .on('workout_executions')
    .columns(['user_id', 'completed_at'])
    .execute();

  // Index for cardio_metrics lookups by execution and type
  await db.schema
    .createIndex('idx_cardio_metrics_execution_type')
    .on('cardio_metrics')
    .columns(['workout_execution_id', 'metric_type'])
    .execute();

  // Index for set_completions lookups by execution
  await db.schema
    .createIndex('idx_set_completions_execution')
    .on('set_completions')
    .column('workout_execution_id')
    .execute();

  // Index for personal_records lookups by user
  await db.schema.createIndex('idx_personal_records_user').on('personal_records').column('user_id').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_workout_executions_user_completed').execute();
  await db.schema.dropIndex('idx_cardio_metrics_execution_type').execute();
  await db.schema.dropIndex('idx_set_completions_execution').execute();
  await db.schema.dropIndex('idx_personal_records_user').execute();
}
