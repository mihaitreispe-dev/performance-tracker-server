import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add UNIQUE constraint to email column
  // Note: This will fail if there are duplicate emails in the table
  await db.schema.alterTable('users').addUniqueConstraint('users_email_unique', ['email']).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('users').dropConstraint('users_email_unique').execute();
}
