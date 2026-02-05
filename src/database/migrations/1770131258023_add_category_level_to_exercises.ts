import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('exercises').addColumn('category', 'varchar(100)').execute();

  await db.schema
    .alterTable('exercises')
    .addColumn('level', sql`exercise_level`)
    .execute();

  await db.schema.createIndex('idx_exercises_category').on('exercises').column('category').execute();
  await db.schema.createIndex('idx_exercises_level').on('exercises').column('level').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_exercises_level').execute();
  await db.schema.dropIndex('idx_exercises_category').execute();
  await db.schema.alterTable('exercises').dropColumn('level').execute();
  await db.schema.alterTable('exercises').dropColumn('category').execute();
}
