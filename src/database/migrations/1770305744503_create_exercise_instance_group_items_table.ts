import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('exercise_instance_group_items')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('group_id', 'uuid', (col) => col.notNull().references('exercise_instance_groups.id').onDelete('cascade'))
    .addColumn('exercise_instance_id', 'uuid', (col) =>
      col.notNull().references('exercise_instances.id').onDelete('cascade'),
    )
    .addColumn('position', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('uq_exercise_instance_group_items_position', ['group_id', 'position'])
    .execute();

  await db.schema
    .createIndex('idx_exercise_instance_group_items_group_id')
    .on('exercise_instance_group_items')
    .column('group_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('exercise_instance_group_items').execute();
}
