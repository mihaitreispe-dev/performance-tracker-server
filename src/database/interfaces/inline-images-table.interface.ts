import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * Inline images embedded in rich-text descriptions. One row per upload,
 * tracking the object-store location + the org that owns it. The
 * /v1/inline-images/:id/view endpoint reads from here, signs a fresh
 * GET URL on demand, and 302s to it — so HTML stored with a stable
 * `${API}/v1/inline-images/${id}/view` src keeps working forever even
 * though the underlying S3 signature rotates every hour.
 */
export interface InlineImagesTable {
  id: Generated<string>;
  organisation_id: string;
  owner_user_id: string | null;
  bucket: string;
  key: string;
  mime_type: string;
  size_bytes: ColumnType<number | null, number | null | undefined, number | null>;
  created_at: Generated<Timestamp>;
}

export type InlineImage = Selectable<InlineImagesTable>;
export type NewInlineImage = Insertable<InlineImagesTable>;
export type InlineImageUpdate = Updateable<InlineImagesTable>;
