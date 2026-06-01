import { Kysely, sql } from 'kysely';

/**
 * Inline images embedded in rich-text descriptions (course descriptions,
 * lesson descriptions, future surfaces).
 *
 * The flow: the rich-text editor calls /v1/inline-images/request-upload,
 * which creates a row + mints a presigned PUT URL + returns a stable
 * `viewUrl` of the form ${API}/v1/inline-images/${id}/view. The editor
 * embeds that viewUrl in the <img src> attribute. When a viewer's
 * browser loads the page, the view endpoint signs a fresh GET URL and
 * redirects to it — so the HTML in the DB stays stable forever even
 * though S3 signatures expire every few hours.
 *
 * organisation_id is the tenancy boundary — only members of the org
 * can request uploads, but the view endpoint stays public (no JWT
 * because <img src> can't carry one). That matches how most CDN-
 * served images work: URL knowledge IS the access control. Inline
 * images are intended for material visible to athletes anyway.
 *
 * owner_user_id is informational (which admin uploaded it); deletion
 * cascades from the user the org delete will pick up via FK rules.
 * mime_type is captured so the proxy can set Content-Type on the
 * redirect headers if needed later.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE inline_images (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      owner_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
      bucket          VARCHAR(255) NOT NULL,
      key             VARCHAR(500) NOT NULL,
      mime_type       VARCHAR(100) NOT NULL,
      size_bytes      INTEGER,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX idx_inline_images_org ON inline_images (organisation_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS inline_images`.execute(db);
}
