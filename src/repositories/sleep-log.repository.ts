import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewSleepLog, SleepLog, SleepLogUpdate } from 'src/database/interfaces';

export interface SleepLogFilter {
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  source?: string;
}

export interface SleepLogFindManyOptions {
  filter?: SleepLogFilter;
  offset?: number;
  limit?: number;
}

@Injectable()
export class SleepLogRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<SleepLog | undefined> {
    return this.db.selectFrom('sleep_logs').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByUserAndDate(userId: string, logDate: Date): Promise<SleepLog[]> {
    return this.db
      .selectFrom('sleep_logs')
      .where('user_id', '=', userId)
      .where('log_date', '=', logDate)
      .selectAll()
      .execute();
  }

  async findByUserAndDateRange(userId: string, startDate: Date, endDate: Date): Promise<SleepLog[]> {
    return this.db
      .selectFrom('sleep_logs')
      .where('user_id', '=', userId)
      .where('log_date', '>=', startDate)
      .where('log_date', '<=', endDate)
      .orderBy('log_date', 'desc')
      .selectAll()
      .execute();
  }

  async findByExternalId(externalId: string): Promise<SleepLog | undefined> {
    return this.db.selectFrom('sleep_logs').where('external_id', '=', externalId).selectAll().executeTakeFirst();
  }

  async findMany(options: SleepLogFindManyOptions = {}): Promise<SleepLog[]> {
    const { filter, offset, limit } = options;
    let query = this.db.selectFrom('sleep_logs').selectAll();

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.startDate) {
      query = query.where('log_date', '>=', filter.startDate);
    }
    if (filter?.endDate) {
      query = query.where('log_date', '<=', filter.endDate);
    }
    if (filter?.source) {
      query = query.where('source', '=', filter.source);
    }

    query = query.orderBy('log_date', 'desc');

    if (offset !== undefined) {
      query = query.offset(offset);
    }
    if (limit !== undefined) {
      query = query.limit(limit);
    }

    return query.execute();
  }

  async countMany(filter?: SleepLogFilter): Promise<number> {
    let query = this.db.selectFrom('sleep_logs').select((eb) => eb.fn.countAll<number>().as('count'));

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.startDate) {
      query = query.where('log_date', '>=', filter.startDate);
    }
    if (filter?.endDate) {
      query = query.where('log_date', '<=', filter.endDate);
    }
    if (filter?.source) {
      query = query.where('source', '=', filter.source);
    }

    const result = await query.executeTakeFirstOrThrow();
    return Number(result.count);
  }

  async create(data: NewSleepLog): Promise<SleepLog> {
    return this.db.insertInto('sleep_logs').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: SleepLogUpdate): Promise<SleepLog> {
    return this.db
      .updateTable('sleep_logs')
      .set({ ...data, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('sleep_logs').where('id', '=', id).execute();
  }

  async upsertByExternalId(data: NewSleepLog): Promise<SleepLog> {
    if (!data.external_id) {
      throw new Error('external_id is required for upsert');
    }

    const existing = await this.findByExternalId(data.external_id);
    if (existing) {
      return this.updateById(existing.id, data);
    }
    return this.create(data);
  }
}
