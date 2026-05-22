import { Kysely, sql } from 'kysely';

/**
 * Adds a parallel `theme_tokens_dark` JSONB column to `organisation_themes`.
 * The existing `theme_tokens` column now semantically represents the *light*
 * variant; the new column carries the dark one. Both are independent maps of
 * the same token keys (primary, secondary, background, surface, text, ...)
 * so the client can pick the appropriate set at render time based on the
 * user's mode preference.
 *
 * `theme_tokens_dark` defaults to `'{}'::jsonb` — same shape as
 * `theme_tokens` did when it was added — so orgs that haven't configured a
 * dark variant simply fall back to the base MUI dark theme (unchanged
 * behaviour for everyone except orgs that opt in).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('organisation_themes')
    .addColumn('theme_tokens_dark', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('organisation_themes').dropColumn('theme_tokens_dark').execute();
}
