import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  DataExportFormat,
  DataExportJob,
  DataExportJobStatus,
  DataExportJobUpdate,
  NewDataExportJob,
} from 'src/database/interfaces';

export interface DataExportJobFilter {
  userId?: string;
  format?: DataExportFormat;
  status?: DataExportJobStatus;
  statuses?: DataExportJobStatus[];
}

@Injectable()
export class DataExportJobRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<DataExportJob | undefined> {
    return this.db.selectFrom('data_export_jobs').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByIdAndUser(id: string, userId: string): Promise<DataExportJob | undefined> {
    return this.db
      .selectFrom('data_export_jobs')
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .selectAll()
      .executeTakeFirst();
  }

  async findMany(filter?: DataExportJobFilter): Promise<DataExportJob[]> {
    let query = this.db.selectFrom('data_export_jobs').selectAll();

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.format) {
      query = query.where('format', '=', filter.format);
    }
    if (filter?.status) {
      query = query.where('status', '=', filter.status);
    }
    if (filter?.statuses && filter.statuses.length > 0) {
      query = query.where('status', 'in', filter.statuses);
    }

    return query.orderBy('created_at', 'desc').execute();
  }

  async findPendingJobs(limit: number = 10): Promise<DataExportJob[]> {
    return this.db
      .selectFrom('data_export_jobs')
      .where('status', '=', DataExportJobStatus.PENDING)
      .selectAll()
      .orderBy('created_at', 'asc')
      .limit(limit)
      .execute();
  }

  async findExpiredJobs(): Promise<DataExportJob[]> {
    return this.db
      .selectFrom('data_export_jobs')
      .where('status', '=', DataExportJobStatus.COMPLETED)
      .where('expires_at', '<', new Date())
      .selectAll()
      .execute();
  }

  async create(data: NewDataExportJob): Promise<DataExportJob> {
    return this.db.insertInto('data_export_jobs').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: DataExportJobUpdate): Promise<DataExportJob> {
    return this.db
      .updateTable('data_export_jobs')
      .set({ ...data, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateProgress(id: string, processed: number, total?: number): Promise<DataExportJob> {
    const update = {
      processed_items: processed,
      updated_at: new Date(),
      ...(total !== undefined ? { total_items: total } : {}),
    };
    return this.db
      .updateTable('data_export_jobs')
      .set(update as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async markStarted(id: string): Promise<DataExportJob> {
    return this.db
      .updateTable('data_export_jobs')
      .set({
        status: DataExportJobStatus.PROCESSING,
        started_at: new Date(),
        updated_at: new Date(),
      } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async markCompleted(
    id: string,
    downloadUrl: string,
    s3Bucket: string,
    s3Key: string,
    fileSizeBytes: number,
    expiresAt: Date,
  ): Promise<DataExportJob> {
    return this.db
      .updateTable('data_export_jobs')
      .set({
        status: DataExportJobStatus.COMPLETED,
        download_url: downloadUrl,
        s3_bucket: s3Bucket,
        s3_key: s3Key,
        file_size_bytes: fileSizeBytes,
        expires_at: expiresAt,
        completed_at: new Date(),
        updated_at: new Date(),
      } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async markFailed(id: string, errorMessage: string): Promise<DataExportJob> {
    return this.db
      .updateTable('data_export_jobs')
      .set({
        status: DataExportJobStatus.FAILED,
        error_message: errorMessage,
        completed_at: new Date(),
        updated_at: new Date(),
      } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async markExpired(id: string): Promise<DataExportJob> {
    return this.db
      .updateTable('data_export_jobs')
      .set({
        status: DataExportJobStatus.EXPIRED,
        download_url: null,
        updated_at: new Date(),
      } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('data_export_jobs').where('id', '=', id).execute();
  }

  async countByUserInPeriod(userId: string, hours: number): Promise<number> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const result = await this.db
      .selectFrom('data_export_jobs')
      .where('user_id', '=', userId)
      .where('created_at', '>=', since as any)
      .select(this.db.fn.count('id').as('count'))
      .executeTakeFirst();
    return Number(result?.count || 0);
  }

  async findLatestByUser(userId: string, limit: number = 10): Promise<DataExportJob[]> {
    return this.db
      .selectFrom('data_export_jobs')
      .where('user_id', '=', userId)
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
  }
}
