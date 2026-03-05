import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('notifications')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('type', sql`notification_type`, (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('body', 'text')
    .addColumn('data', 'jsonb') // Additional data like athleteId, messageId, workoutId, etc.
    .addColumn('read_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Index for fetching user's notifications
  await db.schema
    .createIndex('idx_notifications_user_id_created_at')
    .on('notifications')
    .columns(['user_id', 'created_at'])
    .execute();

  // Index for unread notifications
  await db.schema
    .createIndex('idx_notifications_user_id_read_at')
    .on('notifications')
    .columns(['user_id', 'read_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('notifications').execute();
}
