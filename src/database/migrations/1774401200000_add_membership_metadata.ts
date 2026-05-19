import { Kysely, sql } from 'kysely';

/**
 * Per-(user, org) metadata blob. The integrating app uses this to stash external
 * identifiers ("crm_id": "..."), custom fields, or anything else we don't want to
 * model first-class in the schema. It lives on the membership (not the user) because
 * the same user could appear in multiple orgs with different external profiles.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('organisation_memberships')
    .addColumn('metadata', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('organisation_memberships').dropColumn('metadata').execute();
}
