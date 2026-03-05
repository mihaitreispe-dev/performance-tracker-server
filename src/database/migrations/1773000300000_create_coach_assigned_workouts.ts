import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('coach_assigned_workouts')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('coach_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('athlete_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('workout_id', 'uuid', (col) => col.notNull().references('workouts.id').onDelete('cascade'))
    .addColumn('notes', 'text')
    .addColumn('assigned_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_coach_assigned_workouts_coach_id')
    .on('coach_assigned_workouts')
    .column('coach_id')
    .execute();

  await db.schema
    .createIndex('idx_coach_assigned_workouts_athlete_id')
    .on('coach_assigned_workouts')
    .column('athlete_id')
    .execute();

  await db.schema
    .createIndex('idx_coach_assigned_workouts_workout_id')
    .on('coach_assigned_workouts')
    .column('workout_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('coach_assigned_workouts').execute();
}
