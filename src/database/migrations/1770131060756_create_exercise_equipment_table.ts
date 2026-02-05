import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('exercise_equipment')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('exercise_id', 'uuid', (col) => col.notNull().references('exercises.id').onDelete('cascade'))
    .addColumn('equipment_id', 'uuid', (col) => col.notNull().references('equipment.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('uq_exercise_equipment', ['exercise_id', 'equipment_id'])
    .execute();

  await db.schema
    .createIndex('idx_exercise_equipment_exercise_id')
    .on('exercise_equipment')
    .column('exercise_id')
    .execute();
  await db.schema
    .createIndex('idx_exercise_equipment_equipment_id')
    .on('exercise_equipment')
    .column('equipment_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('exercise_equipment').execute();
}
