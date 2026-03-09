import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  MultiStreamLoadDaily,
  NewMultiStreamLoadDaily,
  UpdateMultiStreamLoadDaily,
} from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';

interface FindManyFilter {
  userId: string;
  dateFrom?: Date;
  dateTo?: Date;
}

interface FindManyOptions {
  filter: FindManyFilter;
  sort?: { field: 'date'; direction: 'asc' | 'desc' }[];
  limit?: number;
}

@Injectable()
export class MultiStreamLoadRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<MultiStreamLoadDaily | undefined> {
    return this.db.selectFrom('multi_stream_load_daily').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findByUserAndDate(userId: string, date: Date): Promise<MultiStreamLoadDaily | undefined> {
    const dateStr = formatDateToYMD(date);
    return this.db
      .selectFrom('multi_stream_load_daily')
      .selectAll()
      .where('user_id', '=', userId)
      .where(sql`date::text`, '=', dateStr)
      .executeTakeFirst();
  }

  async findMany(options: FindManyOptions): Promise<MultiStreamLoadDaily[]> {
    let query = this.db
      .selectFrom('multi_stream_load_daily')
      .selectAll()
      .where('user_id', '=', options.filter.userId);

    if (options.filter.dateFrom) {
      const dateFromStr = formatDateToYMD(options.filter.dateFrom);
      query = query.where(sql`date::text`, '>=', dateFromStr);
    }

    if (options.filter.dateTo) {
      const dateToStr = formatDateToYMD(options.filter.dateTo);
      query = query.where(sql`date::text`, '<=', dateToStr);
    }

    if (options.sort) {
      for (const sort of options.sort) {
        query = query.orderBy(sort.field, sort.direction);
      }
    } else {
      query = query.orderBy('date', 'desc');
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    return query.execute();
  }

  async getLatestForUser(userId: string): Promise<MultiStreamLoadDaily | undefined> {
    return this.db
      .selectFrom('multi_stream_load_daily')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('date', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  async getDateRange(userId: string, days: number = 90): Promise<MultiStreamLoadDaily[]> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);
    const dateFromStr = formatDateToYMD(dateFrom);

    return this.db
      .selectFrom('multi_stream_load_daily')
      .selectAll()
      .where('user_id', '=', userId)
      .where(sql`date::text`, '>=', dateFromStr)
      .orderBy('date', 'asc')
      .execute();
  }

  async create(data: NewMultiStreamLoadDaily): Promise<MultiStreamLoadDaily> {
    return this.db.insertInto('multi_stream_load_daily').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async upsert(data: NewMultiStreamLoadDaily): Promise<MultiStreamLoadDaily> {
    return this.db
      .insertInto('multi_stream_load_daily')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['user_id', 'date']).doUpdateSet({
          aerobic_ctl: data.aerobic_ctl,
          aerobic_atl: data.aerobic_atl,
          aerobic_tsb: data.aerobic_tsb,
          aerobic_daily_load: data.aerobic_daily_load,
          msk_ctl: data.msk_ctl,
          msk_atl: data.msk_atl,
          msk_tsb: data.msk_tsb,
          msk_daily_load: data.msk_daily_load,
          neural_ctl: data.neural_ctl,
          neural_atl: data.neural_atl,
          neural_tsb: data.neural_tsb,
          neural_daily_load: data.neural_daily_load,
          readiness_score: data.readiness_score,
          readiness_override_reason: data.readiness_override_reason,
          limiting_stream: data.limiting_stream,
          metadata: data.metadata,
          updated_at: sql`now()`,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(id: string, data: UpdateMultiStreamLoadDaily): Promise<MultiStreamLoadDaily | undefined> {
    return this.db
      .updateTable('multi_stream_load_daily')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('multi_stream_load_daily').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async deleteByUserAndDateRange(userId: string, dateFrom: Date, dateTo: Date): Promise<number> {
    const dateFromStr = formatDateToYMD(dateFrom);
    const dateToStr = formatDateToYMD(dateTo);

    const result = await this.db
      .deleteFrom('multi_stream_load_daily')
      .where('user_id', '=', userId)
      .where(sql`date::text`, '>=', dateFromStr)
      .where(sql`date::text`, '<=', dateToStr)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  async getDaysWithData(userId: string, dateFrom: Date, dateTo: Date): Promise<string[]> {
    const dateFromStr = formatDateToYMD(dateFrom);
    const dateToStr = formatDateToYMD(dateTo);

    const results = await this.db
      .selectFrom('multi_stream_load_daily')
      .select(sql<string>`date::text`.as('date_str'))
      .where('user_id', '=', userId)
      .where(sql`date::text`, '>=', dateFromStr)
      .where(sql`date::text`, '<=', dateToStr)
      .execute();

    return results.map((r) => r.date_str);
  }
}
