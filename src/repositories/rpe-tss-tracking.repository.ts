import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewRpeTssTracking, RpeTssTracking, RpeTssTrackingUpdate } from 'src/database/interfaces';

export interface RpeTssTrackingFilter {
  userId?: string;
  workoutExecutionId?: string;
  accumulatedFatigueFlag?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface RpeTssTrackingFindManyOptions {
  filter?: RpeTssTrackingFilter;
  offset?: number;
  limit?: number;
}

@Injectable()
export class RpeTssTrackingRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<RpeTssTracking | undefined> {
    return this.db.selectFrom('rpe_tss_tracking').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByWorkoutExecutionId(workoutExecutionId: string): Promise<RpeTssTracking | undefined> {
    return this.db
      .selectFrom('rpe_tss_tracking')
      .where('workout_execution_id', '=', workoutExecutionId)
      .selectAll()
      .executeTakeFirst();
  }

  async findMany(options: RpeTssTrackingFindManyOptions = {}): Promise<RpeTssTracking[]> {
    const { filter, offset, limit } = options;
    let query = this.db.selectFrom('rpe_tss_tracking').selectAll();

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.workoutExecutionId) {
      query = query.where('workout_execution_id', '=', filter.workoutExecutionId);
    }
    if (filter?.accumulatedFatigueFlag !== undefined) {
      query = query.where('accumulated_fatigue_flag', '=', filter.accumulatedFatigueFlag);
    }
    if (filter?.dateFrom) {
      query = query.where('created_at', '>=', filter.dateFrom as any);
    }
    if (filter?.dateTo) {
      query = query.where('created_at', '<=', filter.dateTo as any);
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

  async create(data: NewRpeTssTracking): Promise<RpeTssTracking> {
    return this.db.insertInto('rpe_tss_tracking').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: RpeTssTrackingUpdate): Promise<RpeTssTracking> {
    return this.db
      .updateTable('rpe_tss_tracking')
      .set(data)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('rpe_tss_tracking').where('id', '=', id).execute();
  }

  /**
   * Get recent tracking records for fatigue analysis
   */
  async getRecentForUser(userId: string, days: number = 7): Promise<RpeTssTracking[]> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    return this.db
      .selectFrom('rpe_tss_tracking')
      .where('user_id', '=', userId)
      .where('created_at', '>=', dateFrom as any)
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  }

  /**
   * Calculate average RPE:TSS ratio over a period
   */
  async getAverageRatio(userId: string, days: number = 7): Promise<number | null> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    const result = await this.db
      .selectFrom('rpe_tss_tracking')
      .where('user_id', '=', userId)
      .where('created_at', '>=', dateFrom as any)
      .where('rpe_tss_ratio', 'is not', null)
      .select((eb) => eb.fn.avg<string>('rpe_tss_ratio').as('avg_ratio'))
      .executeTakeFirst();

    return result?.avg_ratio ? parseFloat(result.avg_ratio) : null;
  }
}
