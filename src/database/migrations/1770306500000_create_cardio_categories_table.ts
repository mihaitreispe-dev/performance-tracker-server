import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('cardio_categories')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('sport_type', sql`cardio_sport_type`, (col) => col.notNull())
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('user_id', 'uuid', (col) => col.references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('uq_cardio_categories_sport_name_user', ['sport_type', 'name', 'user_id'])
    .execute();

  await db.schema
    .createIndex('idx_cardio_categories_sport_type')
    .on('cardio_categories')
    .column('sport_type')
    .execute();

  await db.schema.createIndex('idx_cardio_categories_user_id').on('cardio_categories').column('user_id').execute();

  // Seed predefined run categories
  const runCategories = [
    'Fartlek',
    'Hills',
    'Lactate Threshold',
    'Long Run',
    'Marathon Pace',
    'Recovery Run',
    'Tempo Run',
    'Track Workout',
    'VO2 Max',
  ];

  for (const name of runCategories) {
    await sql`INSERT INTO cardio_categories (sport_type, name, user_id) VALUES ('run', ${name}, NULL)`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('cardio_categories').execute();
}
