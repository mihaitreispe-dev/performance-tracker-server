import { Kysely, sql } from 'kysely';

/**
 * Append-only audit log for membership mutations.
 *
 * Capture every role-impacting action — invite, accept, role change,
 * remove, self-leave — so ops can answer "who invited / promoted /
 * removed whom in this org, and when" without trawling app logs.
 * Read endpoint is intentionally NOT wired up here; this is forensics
 * data accessible via direct DB query (or a future admin tool).
 *
 * Foreign keys to users / organisations use NO action on delete: we
 * preserve the row even if the actor or target is later removed
 * because the audit point is precisely "this happened" — losing it
 * because the actor was deleted would defeat the purpose. The org
 * row IS allowed to cascade because deleting an org tears down all
 * its history anyway.
 *
 * Indexed on (organisation_id, created_at desc) — the "what happened
 * in this org lately" query, which is the only access pattern we
 * expect short-term.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE membership_audit_log (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      actor_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
      target_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
      membership_id     UUID,
      action            VARCHAR(32) NOT NULL,
      from_role         VARCHAR(32),
      to_role           VARCHAR(32),
      actor_role        VARCHAR(32) NOT NULL,
      metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`
    CREATE INDEX idx_membership_audit_log_org_created
      ON membership_audit_log (organisation_id, created_at DESC)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS membership_audit_log`.execute(db);
}
