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
  duration_seconds: number | null;
  status: ContentItemStatus;
  tags: ColumnType<string[], string[] | undefined, string[]>;
  media_convert_job_id: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type ContentItem = Selectable<ContentItemsTable>;
export type NewContentItem = Insertable<ContentItemsTable>;
export type ContentItemUpdate = Updateable<ContentItemsTable>;
