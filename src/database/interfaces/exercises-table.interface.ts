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

export interface ExercisesTable {
  id: Generated<string>;
  organisation_id: string | null;
  name: string;
  description: string | null;
  cues: ColumnType<string[], string[] | undefined, string[]>;
  visibility: ExerciseVisibility;
  user_id: string;
  picture_s3_bucket: string | null;
  picture_s3_key: string | null;
  video_s3_bucket: string | null;
  video_s3_key: string | null;
  video_mime_type: string | null;
  category: string | null;
  level: ExerciseLevel | null;
  status: ExerciseStatus;
  media_convert_job_id: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type Exercise = Selectable<ExercisesTable>;
export type NewExercise = Insertable<ExercisesTable>;
export type ExerciseUpdate = Updateable<ExercisesTable>;
