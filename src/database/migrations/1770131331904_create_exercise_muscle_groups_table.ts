import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('exercise_muscle_groups')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('exercise_id', 'uuid', (col) => col.notNull().references('exercises.id').onDelete('cascade'))
    .addColumn('muscle_group_id', 'uuid', (col) => col.notNull().references('muscle_groups.id').onDelete('cascade'))
    .addColumn('is_primary', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('uq_exercise_muscle_groups', ['exercise_id', 'muscle_group_id'])
    .execute();

  await db.schema
    .createIndex('idx_exercise_muscle_groups_exercise_id')
    .on('exercise_muscle_groups')
    .column('exercise_id')
    .execute();
  await db.schema
    .createIndex('idx_exercise_muscle_groups_muscle_group_id')
    .on('exercise_muscle_groups')
    .column('muscle_group_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('exercise_muscle_groups').execute();
}
