import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create exercise_chains table
  await db.schema
    .createTable('exercise_chains')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Create exercise_chain_members table
  await db.schema
    .createTable('exercise_chain_members')
    .addColumn('chain_id', 'uuid', (col) => col.notNull().references('exercise_chains.id').onDelete('cascade'))
    .addColumn('exercise_id', 'uuid', (col) => col.notNull().references('exercises.id').onDelete('cascade'))
    .addColumn('position', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('exercise_chain_members_pkey', ['chain_id', 'exercise_id'])
    .execute();

  // Unique constraint: each exercise can only belong to one chain
  await db.schema
    .createIndex('exercise_chain_members_exercise_id_unique')
    .on('exercise_chain_members')
    .column('exercise_id')
    .unique()
    .execute();

  // Index for chain lookups
  await db.schema
    .createIndex('exercise_chain_members_chain_id_idx')
    .on('exercise_chain_members')
    .column('chain_id')
    .execute();

  // Index for position ordering within chains
  await db.schema
    .createIndex('exercise_chain_members_chain_position_idx')
    .on('exercise_chain_members')
    .columns(['chain_id', 'position'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('exercise_chain_members').execute();
  await db.schema.dropTable('exercise_chains').execute();
}
