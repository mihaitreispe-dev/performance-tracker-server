import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('exercise_instances')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('exercise_id', 'uuid', (col) => col.notNull().references('exercises.id').onDelete('restrict'))
    .addColumn('sets', 'integer', (col) => col.notNull())
    .addColumn('reps', 'integer')
    .addColumn('execution_time', 'integer')
    .addColumn('load', 'numeric(10, 2)')
    .addColumn('intensity', sql`exercise_instance_intensity`)
    .addColumn('tempo', sql`exercise_instance_tempo`)
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_exercise_instances_exercise_id')
    .on('exercise_instances')
    .column('exercise_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('exercise_instances').execute();
}
