import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum DataExportFormat {
  CSV = 'csv',
  JSON = 'json',
  FIT = 'fit',
}

export enum DataExportCategory {
  WORKOUTS = 'workouts',
  WORKOUT_EXECUTIONS = 'workout_executions',
  CARDIO_METRICS = 'cardio_metrics',
  ROUTES = 'routes',
  HEALTH_METRICS = 'health_metrics',
  PERSONAL_RECORDS = 'personal_records',
  TRAINING_LOAD = 'training_load',
  USER_SETTINGS = 'user_settings',
  SLEEP = 'sleep',
}

export enum DataExportJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

export interface DataExportJobsTable {
  id: Generated<string>;
  user_id: string;
  format: DataExportFormat;
  categories: DataExportCategory[];
  status: DataExportJobStatus;
  s3_bucket: string | null;
  s3_key: string | null;
  download_url: string | null;
  expires_at: Timestamp | null;
  total_items: number | null;
  processed_items: Generated<number>;
  file_size_bytes: number | null;
  error_message: string | null;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type DataExportJob = Selectable<DataExportJobsTable>;
export type NewDataExportJob = Insertable<DataExportJobsTable>;
export type DataExportJobUpdate = Updateable<DataExportJobsTable>;
