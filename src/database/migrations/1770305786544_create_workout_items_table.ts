import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('workout_items')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workout_id', 'uuid', (col) => col.notNull().references('workouts.id').onDelete('cascade'))
    .addColumn('exercise_instance_id', 'uuid', (col) => col.references('exercise_instances.id').onDelete('cascade'))
    .addColumn('exercise_instance_group_id', 'uuid', (col) =>
      col.references('exercise_instance_groups.id').onDelete('cascade'),
    )
    .addColumn('position', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('uq_workout_items_position', ['workout_id', 'position'])
    .addCheckConstraint(
      'chk_workout_items_exactly_one_ref',
      sql`(exercise_instance_id IS NOT NULL AND exercise_instance_group_id IS NULL) OR (exercise_instance_id IS NULL AND exercise_instance_group_id IS NOT NULL)`,
    )
    .execute();

  await db.schema.createIndex('idx_workout_items_workout_id').on('workout_items').column('workout_id').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('workout_items').execute();
}
