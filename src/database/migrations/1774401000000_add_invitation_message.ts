import { Kysely } from 'kysely';

/**
 * Adds an optional `invitation_message` column to organisation_memberships so the
 * inviter can include a short note that the invitee sees in their pending-invitations
 * banner before accepting.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('organisation_memberships')
    .addColumn('invitation_message', 'text')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('organisation_memberships').dropColumn('invitation_message').execute();
}
