import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('coach_athlete_relationships')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('coach_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('athlete_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('status', sql`coach_athlete_status`, (col) => col.notNull().defaultTo('pending'))
    .addColumn('invitation_message', 'text')
    .addColumn('invited_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('responded_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('idx_coach_athlete_relationships_coach_id')
    .on('coach_athlete_relationships')
    .column('coach_id')
    .execute();

  await db.schema
    .createIndex('idx_coach_athlete_relationships_athlete_id')
    .on('coach_athlete_relationships')
    .column('athlete_id')
    .execute();

  await db.schema
    .createIndex('idx_coach_athlete_relationships_status')
    .on('coach_athlete_relationships')
    .column('status')
    .execute();

  // Ensure an athlete can only have one active coach
  await sql`CREATE UNIQUE INDEX idx_coach_athlete_active_unique
    ON coach_athlete_relationships (athlete_id)
    WHERE status = 'active'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('coach_athlete_relationships').execute();
}
