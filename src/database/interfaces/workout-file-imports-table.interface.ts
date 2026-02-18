import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum WorkoutFileFormat {
  FIT = 'fit',
  TCX = 'tcx',
  GPX = 'gpx',
}

export enum WorkoutFileImportStatus {
  PENDING = 'pending',
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface WorkoutFileImportsTable {
  id: Generated<string>;
  user_id: string;
  file_name: string;
  file_format: WorkoutFileFormat;
  file_size_bytes: number;
  s3_bucket: string;
  s3_key: string;
  status: WorkoutFileImportStatus;
  workout_schedule_id: string | null;
  workout_execution_id: string | null;
  error_message: string | null;
  processed_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type WorkoutFileImport = Selectable<WorkoutFileImportsTable>;
export type NewWorkoutFileImport = Insertable<WorkoutFileImportsTable>;
export type WorkoutFileImportUpdate = Updateable<WorkoutFileImportsTable>;
