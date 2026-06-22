import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum ExerciseVisibility {
  PRIVATE = 'private',
  PUBLIC = 'public',
}

export enum ExerciseLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export enum ExerciseStatus {
  DRAFT = 'draft',
  UPLOAD_PENDING = 'upload_pending',
  UPLOAD_DONE = 'upload_done',
  ASSETS_PENDING = 'assets_pending',
  ASSETS_DONE = 'assets_done',
  ASSETS_FAILED = 'assets_failed',
  ASSETS_CANCELED = 'assets_canceled',
}

/**
 * Per-exercise voice-over modes (1774403200000 migration).
 *
 *  - 'off'                  → no voice-over; player suppresses any VO
 *  - 'recorded'             → coach uploaded an audio file; the S3
 *                              pointer trio (bucket/key/mime) is
 *                              guaranteed non-null by a DB CHECK
 *
 * (The legacy 'generated_from_cues' mode was retired with the removal of
 * exercise cues — intros replace coaching cues.)
 */
export enum ExerciseVoiceoverMode {
  OFF = 'off',
  RECORDED = 'recorded',
}

export interface ExercisesTable {
  id: Generated<string>;
  organisation_id: string;
  name: string;
  description: string | null;
  visibility: ExerciseVisibility;
  user_id: string;
  /**
   * Auto-extracted thumbnail from the exercise's video, produced by the
   * MediaConvert pipeline once the upload finishes. Null while the video is
   * still in flight, populated once status reaches `assets_done`. Never set
   * by an end-user — there's no separate image upload path.
   */
  thumbnail_s3_bucket: string | null;
  thumbnail_s3_key: string | null;
  /**
   * Mandatory for any non-draft exercise — enforced at the DB level via the
   * `exercises_video_required_chk` CHECK constraint (migration
   * 1774401800000). The columns stay nullable so a freshly-created draft can
   * exist between `POST /exercises` and the first upload-url request.
   */
  video_s3_bucket: string | null;
  video_s3_key: string | null;
  video_mime_type: string | null;
  /** Single biomechanical movement pattern (FK → movement_patterns). */
  movement_pattern_id: string | null;
  level: ExerciseLevel | null;
  status: ExerciseStatus;
  media_convert_job_id: string | null;
  /**
   * Smart-crop (Rekognition) state. While `status = assets_pending` and this
   * is set but `media_convert_job_id` is null, the exercise is in the
   * body-detect analysis phase: a cron polls the Rekognition job, computes
   * the 16:9 crop, then creates the MediaConvert job (which sets
   * `media_convert_job_id` and hands off to the encode-status cron).
   */
  rekognition_job_id: string | null;
  /** When smart-crop analysis began — drives the analysis-timeout fallback. */
  smart_crop_started_at: Timestamp | null;
  /**
   * Local-transcode state (dev-only, mirrors smart-crop's pattern). When
   * `local_transcode_pending = true` and `status = assets_pending`, the
   * exercise is waiting for the local ffmpeg cron to claim and transcode it.
   * The cron stamps `local_transcode_started_at` on claim and skips rows
   * claimed in the last 10 minutes, so a process restart resumes after the
   * timeout rather than spinning two ffmpegs on the same row.
   */
  local_transcode_pending: ColumnType<boolean, boolean | undefined, boolean>;
  local_transcode_started_at: Timestamp | null;
  intro_content_item_id: string | null;
  /** Inline intro markers on the exercise's main demo video — used by the player's Skip-intro affordance. */
  intro_start_seconds: number | null;
  intro_end_seconds: number | null;
  /**
   * Where the EXECUTION (demonstration) begins, independent of intro_end_seconds
   * so the two can overlap. Skip-intro seeks here when set; NULL falls back to
   * intro_end_seconds (today's behaviour). Whole seconds into the main video.
   */
  execution_start_seconds: number | null;
  /** Vimeo source video id, when this exercise was imported via the Vimeo flow. */
  vimeo_video_id: string | null;
  /**
   * Voice-over configuration (see ExerciseVoiceoverMode + the
   * 1774403200000 migration). Defaults to 'off' on every row;
   * coaches opt in per-exercise from the editor.
   */
  voiceover_mode: ColumnType<ExerciseVoiceoverMode, ExerciseVoiceoverMode | undefined, ExerciseVoiceoverMode>;
  /** S3 pointer for the recorded voice-over file (recorded mode only). */
  voiceover_s3_bucket: string | null;
  voiceover_s3_key: string | null;
  voiceover_mime_type: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type Exercise = Selectable<ExercisesTable>;
export type NewExercise = Insertable<ExercisesTable>;
export type ExerciseUpdate = Updateable<ExercisesTable>;
