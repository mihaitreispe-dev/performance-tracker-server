import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('coaching_messages')
    .addColumn('attached_workout_id', 'uuid', (col) => col.references('workouts.id').onDelete('set null'))
    .addColumn('attached_plan_id', 'uuid', (col) => col.references('workout_plans.id').onDelete('set null'))
    .execute();

  // Add indexes for the new columns
  await db.schema
    .createIndex('idx_coaching_messages_attached_workout')
    .on('coaching_messages')
    .column('attached_workout_id')
    .execute();

  await db.schema
    .createIndex('idx_coaching_messages_attached_plan')
    .on('coaching_messages')
    .column('attached_plan_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_coaching_messages_attached_plan').execute();
  await db.schema.dropIndex('idx_coaching_messages_attached_workout').execute();

  await db.schema
    .alterTable('coaching_messages')
    .dropColumn('attached_plan_id')
    .dropColumn('attached_workout_id')
    .execute();
}
