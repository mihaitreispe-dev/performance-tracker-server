import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum ContentItemKind {
  SNACK = 'snack',
  COURSE_LESSON = 'course_lesson',
  EXERCISE_INTRO = 'exercise_intro',
}

export enum ContentItemStatus {
  DRAFT = 'draft',
  UPLOAD_PENDING = 'upload_pending',
  READY = 'ready',
  FAILED = 'failed',
}

export interface ContentItemsTable {
  id: Generated<string>;
  organisation_id: string;
  kind: ContentItemKind;
  title: string;
  description: string | null;
  owner_user_id: string | null;
  video_s3_bucket: string | null;
  video_s3_key: string | null;
  video_mime_type: string | null;
  thumbnail_s3_bucket: string | null;
  thumbnail_s3_key: string | null;
  /**
   * Companion 9:16 cut produced by the local-transcode pipeline (or
   * MediaConvert in prod). Populated some time after the source
   * upload finishes; null until then. Phone-portrait viewers prefer
   * this asset; landscape / desktop viewers fall back to `video_s3_*`.
   */
  video_portrait_s3_bucket: string | null;
  video_portrait_s3_key: string | null;
  /**
   * Durable claim for the local-transcode worker. The API flips
   * `transcode_pending` true in markUploadComplete; the cron stamps
   * `transcode_started_at` to claim the row (10-minute timeout, then
   * a stale claim can be re-taken). Mirror of exercises.local_transcode_*.
   */
  transcode_pending: ColumnType<boolean, boolean | undefined, boolean>;
  transcode_started_at: Timestamp | null;
  duration_seconds: number | null;
  status: ContentItemStatus;
  tags: ColumnType<string[], string[] | undefined, string[]>;
  media_convert_job_id: string | null;
  /** Inline intro markers — used by content-item players (course lessons, snacks) to offer Skip-intro. */
  intro_start_seconds: number | null;
  intro_end_seconds: number | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type ContentItem = Selectable<ContentItemsTable>;
export type NewContentItem = Insertable<ContentItemsTable>;
export type ContentItemUpdate = Updateable<ContentItemsTable>;
