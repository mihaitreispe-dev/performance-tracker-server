import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('cardio_step_group_items')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('group_id', 'uuid', (col) => col.notNull().references('cardio_step_groups.id').onDelete('cascade'))
    .addColumn('cardio_step_id', 'uuid', (col) => col.notNull().references('cardio_steps.id').onDelete('cascade'))
    .addColumn('position', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('uq_cardio_step_group_items_position', ['group_id', 'position'])
    .execute();

  await db.schema
    .createIndex('idx_cardio_step_group_items_group_id')
    .on('cardio_step_group_items')
    .column('group_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('cardio_step_group_items').execute();
}
