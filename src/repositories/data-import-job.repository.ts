import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  DataImportJob,
  DataImportJobStatus,
  DataImportJobUpdate,
  DataImportType,
  NewDataImportJob,
} from 'src/database/interfaces';

export interface DataImportJobFilter {
  userId?: string;
  importType?: DataImportType;
  status?: DataImportJobStatus;
  statuses?: DataImportJobStatus[];
}

@Injectable()
export class DataImportJobRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<DataImportJob | undefined> {
    return this.db.selectFrom('data_import_jobs').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByIdAndUser(id: string, userId: string): Promise<DataImportJob | undefined> {
    return this.db
      .selectFrom('data_import_jobs')
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .selectAll()
      .executeTakeFirst();
  }

  async findMany(filter?: DataImportJobFilter): Promise<DataImportJob[]> {
    let query = this.db.selectFrom('data_import_jobs').selectAll();

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.importType) {
      query = query.where('import_type', '=', filter.importType);
    }
    if (filter?.status) {
      query = query.where('status', '=', filter.status);
    }
    if (filter?.statuses && filter.statuses.length > 0) {
      query = query.where('status', 'in', filter.statuses);
    }

    return query.orderBy('created_at', 'desc').execute();
  }

  async findPendingJobs(limit: number = 10): Promise<DataImportJob[]> {
    return this.db
      .selectFrom('data_import_jobs')
      .where('status', 'in', [DataImportJobStatus.PENDING, DataImportJobStatus.UPLOADING])
      .selectAll()
      .orderBy('created_at', 'asc')
      .limit(limit)
      .execute();
  }

  async create(data: NewDataImportJob): Promise<DataImportJob> {
    return this.db.insertInto('data_import_jobs').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: DataImportJobUpdate): Promise<DataImportJob> {
    return this.db
      .updateTable('data_import_jobs')
      .set({ ...data, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateProgress(
    id: string,
    processed: number,
    skipped: number,
    failed: number,
    total?: number,
  ): Promise<DataImportJob> {
    const update = {
      processed_items: processed,
      skipped_items: skipped,
      failed_items: failed,
      updated_at: new Date(),
      ...(total !== undefined ? { total_items: total } : {}),
    };
    return this.db
      .updateTable('data_import_jobs')
      .set(update as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async markStarted(id: string): Promise<DataImportJob> {
    return this.db
      .updateTable('data_import_jobs')
      .set({
        status: DataImportJobStatus.PROCESSING,
        started_at: new Date(),
        updated_at: new Date(),
      } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async markCompleted(id: string): Promise<DataImportJob> {
    return this.db
      .updateTable('data_import_jobs')
      .set({
        status: DataImportJobStatus.COMPLETED,
        completed_at: new Date(),
        updated_at: new Date(),
      } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async markFailed(id: string, errorMessage: string): Promise<DataImportJob> {
    return this.db
      .updateTable('data_import_jobs')
      .set({
        status: DataImportJobStatus.FAILED,
        error_message: errorMessage,
        completed_at: new Date(),
        updated_at: new Date(),
      } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('data_import_jobs').where('id', '=', id).execute();
  }

  async countByUserInPeriod(userId: string, hours: number): Promise<number> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const result = await this.db
      .selectFrom('data_import_jobs')
      .where('user_id', '=', userId)
      .where('created_at', '>=', since as any)
      .select(this.db.fn.count('id').as('count'))
      .executeTakeFirst();
    return Number(result?.count || 0);
  }
}
