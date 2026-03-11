import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, IllnessLog, IllnessLogUpdate, IllnessType, NewIllnessLog } from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';

export interface IllnessLogFilter {
  userId?: string;
  illnessType?: IllnessType;
  severityMin?: number;
  severityMax?: number;
  isActive?: boolean; // end_date is null
  dateFrom?: Date;
  dateTo?: Date;
}

export interface IllnessLogFindManyOptions {
  filter?: IllnessLogFilter;
  offset?: number;
  limit?: number;
}

@Injectable()
export class IllnessLogRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<IllnessLog | undefined> {
    return this.db.selectFrom('illness_logs').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findMany(options: IllnessLogFindManyOptions = {}): Promise<IllnessLog[]> {
    const { filter, offset, limit } = options;
    let query = this.db.selectFrom('illness_logs').selectAll();

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.illnessType) {
      query = query.where('illness_type', '=', filter.illnessType);
    }
    if (filter?.severityMin !== undefined) {
      query = query.where('severity', '>=', filter.severityMin);
    }
    if (filter?.severityMax !== undefined) {
      query = query.where('severity', '<=', filter.severityMax);
    }
    if (filter?.isActive !== undefined) {
      if (filter.isActive) {
        query = query.where('end_date', 'is', null);
      } else {
        query = query.where('end_date', 'is not', null);
      }
    }
    if (filter?.dateFrom) {
      query = query.where('start_date', '>=', formatDateToYMD(filter.dateFrom));
    }
    if (filter?.dateTo) {
      query = query.where('start_date', '<=', formatDateToYMD(filter.dateTo));
    }

    query = query.orderBy('start_date', 'desc');

    if (offset !== undefined) {
      query = query.offset(offset);
    }
    if (limit !== undefined) {
      query = query.limit(limit);
    }

    return query.execute();
  }

  async getActiveForUser(userId: string): Promise<IllnessLog[]> {
    return this.db
      .selectFrom('illness_logs')
      .where('user_id', '=', userId)
      .where('end_date', 'is', null)
      .selectAll()
      .orderBy('start_date', 'desc')
      .execute();
  }

  async getRecentForUser(userId: string, days: number = 30): Promise<IllnessLog[]> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    return this.db
      .selectFrom('illness_logs')
      .where('user_id', '=', userId)
      .where('start_date', '>=', formatDateToYMD(dateFrom))
      .selectAll()
      .orderBy('start_date', 'desc')
      .execute();
  }

  async create(data: NewIllnessLog): Promise<IllnessLog> {
    return this.db.insertInto('illness_logs').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: IllnessLogUpdate): Promise<IllnessLog> {
    return this.db
      .updateTable('illness_logs')
      .set({ ...data, updated_at: sql`now()` } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('illness_logs').where('id', '=', id).execute();
  }

  /**
   * Get illness logs that have been active for more than a specified number of days
   */
  async getOngoingConcerns(userId: string, minDays: number = 3): Promise<IllnessLog[]> {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - minDays);

    return this.db
      .selectFrom('illness_logs')
      .where('user_id', '=', userId)
      .where('end_date', 'is', null)
      .where('start_date', '<=', formatDateToYMD(thresholdDate))
      .selectAll()
      .execute();
  }
}
