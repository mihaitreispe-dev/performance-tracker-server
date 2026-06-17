import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/** What a translation row points at — see migration 1774404200000. */
export type TranslationTargetType = 'exercise_voiceover' | 'exercise_intro' | 'content_item';

/**
 * The pipeline stage a translation is in. Advances:
 *   pending → transcribing → machine_translated → in_review
 *           → approved → published   (or → failed)
 * Nothing is shown to an athlete before `published`.
 */
export type TranslationReviewStatus =
  | 'pending'
  | 'transcribing'
  | 'machine_translated'
  | 'in_review'
  | 'approved'
  | 'published'
  | 'failed';

/** Async-job state for the Transcribe / dub steps. */
export type TranslationJobStatus = 'queued' | 'running' | 'done' | 'failed';

/**
 * Per-(target, language) translation row. See migration
 * 1774404200000 for the column semantics.
 */
export interface ContentTranslationsTable {
  id: Generated<string>;
  target_type: TranslationTargetType;
  target_id: string;
  locale: string;
  source_locale: Generated<string>;
  organisation_id: string | null;

  source_text: string | null;
  translated_text: string | null;
  review_status: Generated<TranslationReviewStatus>;

  transcribe_job_name: string | null;
  transcribe_status: TranslationJobStatus | null;

  caption_vtt_s3_bucket: string | null;
  caption_vtt_s3_key: string | null;

  dub_provider: string | null;
  dub_job_id: string | null;
  dub_status: TranslationJobStatus | null;
  dubbed_audio_s3_bucket: string | null;
  dubbed_audio_s3_key: string | null;
  dubbed_audio_mime_type: string | null;

  reviewed_by: string | null;
  reviewed_at: Timestamp | null;
  published_at: Timestamp | null;

  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type ContentTranslation = Selectable<ContentTranslationsTable>;
export type NewContentTranslation = Insertable<ContentTranslationsTable>;
export type ContentTranslationUpdate = Updateable<ContentTranslationsTable>;
