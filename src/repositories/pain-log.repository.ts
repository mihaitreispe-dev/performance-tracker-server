import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { BodyPart, BodyView, Database, NewPainLog, PainLog, PainLogUpdate, PainTrend } from 'src/database/interfaces';

export interface PainLogFilter {
  userId?: string;
  workoutExecutionId?: string;
  bodyPart?: BodyPart;
  bodyView?: BodyView;
  painTrend?: PainTrend;
  minPainLevel?: number;
  maxPainLevel?: number;
}

export interface PainLogFindManyOptions {
  filter?: PainLogFilter;
  offset?: number;
  limit?: number;
}

@Injectable()
export class PainLogRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<PainLog | undefined> {
    return this.db.selectFrom('pain_logs').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByWorkoutExecutionId(workoutExecutionId: string): Promise<PainLog[]> {
    return this.db
      .selectFrom('pain_logs')
      .where('workout_execution_id', '=', workoutExecutionId)
      .orderBy('created_at', 'asc')
      .selectAll()
      .execute();
  }

  async findByUserIdAndExecutionIds(userId: string, executionIds: string[]): Promise<PainLog[]> {
    if (executionIds.length === 0) return [];

    return this.db
      .selectFrom('pain_logs')
      .where('user_id', '=', userId)
      .where('workout_execution_id', 'in', executionIds)
      .orderBy('created_at', 'asc')
      .selectAll()
      .execute();
  }

  async findMany(options: PainLogFindManyOptions = {}): Promise<PainLog[]> {
    const { filter, offset, limit } = options;
    let query = this.db.selectFrom('pain_logs').selectAll();

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.workoutExecutionId) {
      query = query.where('workout_execution_id', '=', filter.workoutExecutionId);
    }
    if (filter?.bodyPart) {
      query = query.where('body_part', '=', filter.bodyPart);
    }
    if (filter?.bodyView) {
      query = query.where('body_view', '=', filter.bodyView);
    }
    if (filter?.painTrend) {
      query = query.where('pain_trend', '=', filter.painTrend);
    }
    if (filter?.minPainLevel !== undefined) {
      query = query.where('pain_level', '>=', filter.minPainLevel);
    }
    if (filter?.maxPainLevel !== undefined) {
      query = query.where('pain_level', '<=', filter.maxPainLevel);
    }

    query = query.orderBy('created_at', 'desc');

    if (offset !== undefined) {
      query = query.offset(offset);
    }
    if (limit !== undefined) {
      query = query.limit(limit);
    }

    return query.execute();
  }

  async countMany(filter?: PainLogFilter): Promise<number> {
    let query = this.db.selectFrom('pain_logs').select((eb) => eb.fn.countAll<number>().as('count'));

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.workoutExecutionId) {
      query = query.where('workout_execution_id', '=', filter.workoutExecutionId);
    }
    if (filter?.bodyPart) {
      query = query.where('body_part', '=', filter.bodyPart);
    }
    if (filter?.bodyView) {
      query = query.where('body_view', '=', filter.bodyView);
    }
    if (filter?.painTrend) {
      query = query.where('pain_trend', '=', filter.painTrend);
    }
    if (filter?.minPainLevel !== undefined) {
      query = query.where('pain_level', '>=', filter.minPainLevel);
    }
    if (filter?.maxPainLevel !== undefined) {
      query = query.where('pain_level', '<=', filter.maxPainLevel);
    }

    const result = await query.executeTakeFirstOrThrow();
    return Number(result.count);
  }

  async create(data: NewPainLog): Promise<PainLog> {
    return this.db.insertInto('pain_logs').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async createMany(data: NewPainLog[]): Promise<PainLog[]> {
    if (data.length === 0) return [];
    return this.db.insertInto('pain_logs').values(data).returningAll().execute();
  }

  async updateById(id: string, data: PainLogUpdate): Promise<PainLog> {
    return this.db
      .updateTable('pain_logs')
      .set({ ...data, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('pain_logs').where('id', '=', id).execute();
  }

  async deleteByWorkoutExecutionId(workoutExecutionId: string): Promise<void> {
    await this.db.deleteFrom('pain_logs').where('workout_execution_id', '=', workoutExecutionId).execute();
  }
}
