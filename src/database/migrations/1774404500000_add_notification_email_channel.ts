import { Kysely, sql } from 'kysely';

/**
 * Adds an email delivery channel to notification rules (SendGrid), alongside
 * the existing push (FCM / external-app) channel.
 *
 * - `channels` lets a rule fire on push, email, or both. Defaults to
 *   ARRAY['push'] so every existing rule keeps its current push-only
 *   behaviour with no data backfill.
 * - `email_subject` / `email_body` carry the email content (the existing
 *   `title` / `body` stay the push content). Email body is HTML-capable.
 * - The deliveries `route` CHECK gains 'email' so per-recipient email sends
 *   are recorded in the same append-only audit log.
 *
 * Email is app-independent: it resolves recipients via `users.email`, so it
 * reaches ReHabit white-label clients and Step Zero users alike regardless of
 * the org's `uses_external_app` push routing.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE notification_rules
      ADD COLUMN channels      TEXT[] NOT NULL DEFAULT ARRAY['push']::text[],
      ADD COLUMN email_subject TEXT NULL,
      ADD COLUMN email_body    TEXT NULL
  `.execute(db);

  await sql`
    ALTER TABLE notification_rules
      ADD CONSTRAINT notification_rules_channels_chk CHECK (
        array_length(channels, 1) >= 1
        AND channels <@ ARRAY['push', 'email']::text[]
      )
  `.execute(db);

  // If a rule sends email, it must carry email content.
  await sql`
    ALTER TABLE notification_rules
      ADD CONSTRAINT notification_rules_email_content_chk CHECK (
        NOT ('email' = ANY(channels))
        OR (email_subject IS NOT NULL AND email_body IS NOT NULL)
      )
  `.execute(db);

  // Widen the delivery route enum to include email.
  await sql`
    ALTER TABLE notification_rule_deliveries
      DROP CONSTRAINT notification_deliveries_route_chk
  `.execute(db);
  await sql`
    ALTER TABLE notification_rule_deliveries
      ADD CONSTRAINT notification_deliveries_route_chk CHECK (
        route IN ('fcm', 'external_app', 'email')
      )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE notification_rule_deliveries
      DROP CONSTRAINT notification_deliveries_route_chk
  `.execute(db);
  await sql`
    ALTER TABLE notification_rule_deliveries
      ADD CONSTRAINT notification_deliveries_route_chk CHECK (
        route IN ('fcm', 'external_app')
      )
  `.execute(db);

  await sql`
    ALTER TABLE notification_rules
      DROP CONSTRAINT IF EXISTS notification_rules_email_content_chk,
      DROP CONSTRAINT IF EXISTS notification_rules_channels_chk,
      DROP COLUMN IF EXISTS email_body,
      DROP COLUMN IF EXISTS email_subject,
      DROP COLUMN IF EXISTS channels
  `.execute(db);
}
