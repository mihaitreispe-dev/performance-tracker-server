import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('coaching_messages')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('relationship_id', 'uuid', (col) =>
      col.notNull().references('coach_athlete_relationships.id').onDelete('cascade'),
    )
    .addColumn('sender_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('workout_schedule_id', 'uuid', (col) => col.references('workout_schedules.id').onDelete('set null')) // Optional: link to specific workout
    .addColumn('is_workout_note', 'boolean', (col) => col.notNull().defaultTo(false)) // Mark as workout note vs general message
    .addColumn('read_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for conversation listing
  await db.schema
    .createIndex('idx_coaching_messages_relationship_created')
    .on('coaching_messages')
    .columns(['relationship_id', 'created_at'])
    .execute();

  // Index for workout-specific notes
  await db.schema
    .createIndex('idx_coaching_messages_workout_schedule')
    .on('coaching_messages')
    .columns(['workout_schedule_id'])
    .execute();

  // Index for sender lookup
  await db.schema.createIndex('idx_coaching_messages_sender').on('coaching_messages').columns(['sender_id']).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('coaching_messages').execute();
}
