import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum DataImportType {
  GARMIN_ARCHIVE = 'garmin_archive',
  TRAININGPEAKS_ARCHIVE = 'trainingpeaks_archive',
}

export enum DataImportJobStatus {
  PENDING = 'pending',
  UPLOADING = 'uploading',
  EXTRACTING = 'extracting',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface DataImportJobsTable {
  id: Generated<string>;
  user_id: string;
  import_type: DataImportType;
  status: DataImportJobStatus;
  s3_bucket: string | null;
  s3_key: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  total_items: number | null;
  processed_items: Generated<number>;
  skipped_items: Generated<number>;
  failed_items: Generated<number>;
  error_message: string | null;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type DataImportJob = Selectable<DataImportJobsTable>;
export type NewDataImportJob = Insertable<DataImportJobsTable>;
export type DataImportJobUpdate = Updateable<DataImportJobsTable>;
