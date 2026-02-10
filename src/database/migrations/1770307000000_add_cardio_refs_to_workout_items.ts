import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add new columns
  await db.schema
    .alterTable('workout_items')
    .addColumn('cardio_step_id', 'uuid', (col) => col.references('cardio_steps.id').onDelete('cascade'))
    .execute();

  await db.schema
    .alterTable('workout_items')
    .addColumn('cardio_step_group_id', 'uuid', (col) => col.references('cardio_step_groups.id').onDelete('cascade'))
    .execute();

  // Drop old constraint
  await sql`ALTER TABLE workout_items DROP CONSTRAINT IF EXISTS chk_workout_items_exactly_one_ref`.execute(db);

  // Add new constraint: exactly one of the 4 references must be set
  await sql`
    ALTER TABLE workout_items ADD CONSTRAINT chk_workout_items_exactly_one_ref CHECK (
      (
        (exercise_instance_id IS NOT NULL)::int +
        (exercise_instance_group_id IS NOT NULL)::int +
        (cardio_step_id IS NOT NULL)::int +
        (cardio_step_group_id IS NOT NULL)::int
      ) = 1
    )
  `.execute(db);

  // Add indexes
  await db.schema
    .createIndex('idx_workout_items_cardio_step_id')
    .on('workout_items')
    .column('cardio_step_id')
    .execute();

  await db.schema
    .createIndex('idx_workout_items_cardio_step_group_id')
    .on('workout_items')
    .column('cardio_step_group_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop indexes
  await db.schema.dropIndex('idx_workout_items_cardio_step_id').execute();
  await db.schema.dropIndex('idx_workout_items_cardio_step_group_id').execute();

  // Drop new constraint
  await sql`ALTER TABLE workout_items DROP CONSTRAINT IF EXISTS chk_workout_items_exactly_one_ref`.execute(db);

  // Restore old constraint
  await sql`
    ALTER TABLE workout_items ADD CONSTRAINT chk_workout_items_exactly_one_ref CHECK (
      (exercise_instance_id IS NOT NULL AND exercise_instance_group_id IS NULL) OR
      (exercise_instance_id IS NULL AND exercise_instance_group_id IS NOT NULL)
    )
  `.execute(db);

  // Drop columns
  await db.schema.alterTable('workout_items').dropColumn('cardio_step_id').execute();
  await db.schema.alterTable('workout_items').dropColumn('cardio_step_group_id').execute();
}
