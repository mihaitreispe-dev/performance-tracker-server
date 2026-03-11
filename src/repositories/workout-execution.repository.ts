import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  NewWorkoutExecution,
  WorkoutExecution,
  WorkoutExecutionSource,
  WorkoutExecutionUpdate,
} from 'src/database/interfaces';

export interface WorkoutExecutionFilter {
  userId?: string;
  workoutScheduleId?: string;
  source?: WorkoutExecutionSource;
  dateFrom?: Date;
  dateTo?: Date;
  completedDateFrom?: Date;
  completedDateTo?: Date;
  completed?: boolean;
  externalId?: string;
}

export interface WorkoutExecutionSort {
  field: 'started_at' | 'completed_at' | 'created_at' | 'updated_at';
  direction?: 'asc' | 'desc';
}

export interface WorkoutExecutionFindManyOptions {
  filter?: WorkoutExecutionFilter;
  sort?: WorkoutExecutionSort[];
  offset?: number;
  limit?: number;
}

@Injectable()
export class WorkoutExecutionRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<WorkoutExecution | undefined> {
    return this.db.selectFrom('workout_executions').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByIds(ids: string[]): Promise<WorkoutExecution[]> {
    if (ids.length === 0) return [];
    return this.db.selectFrom('workout_executions').where('id', 'in', ids).selectAll().execute();
  }

  async findByExternalId(externalId: string, source: WorkoutExecutionSource): Promise<WorkoutExecution | undefined> {
    return this.db
      .selectFrom('workout_executions')
      .where('external_id', '=', externalId)
      .where('source', '=', source)
      .selectAll()
      .executeTakeFirst();
  }

  async findMany(options: WorkoutExecutionFindManyOptions = {}): Promise<WorkoutExecution[]> {
    const { filter, sort, offset, limit } = options;
    let query = this.db.selectFrom('workout_executions').selectAll();

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.workoutScheduleId) {
      query = query.where('workout_schedule_id', '=', filter.workoutScheduleId);
    }
    if (filter?.source) {
      query = query.where('source', '=', filter.source);
    }
    if (filter?.externalId) {
      query = query.where('external_id', '=', filter.externalId);
    }
    if (filter?.dateFrom) {
      query = query.where('started_at', '>=', filter.dateFrom);
    }
    if (filter?.dateTo) {
      query = query.where('started_at', '<=', filter.dateTo);
    }
    if (filter?.completedDateFrom) {
      query = query.where('completed_at', '>=', filter.completedDateFrom);
    }
    if (filter?.completedDateTo) {
      query = query.where('completed_at', '<=', filter.completedDateTo);
    }
    if (filter?.completed !== undefined) {
      if (filter.completed) {
        query = query.where('completed_at', 'is not', null);
      } else {
        query = query.where('completed_at', 'is', null);
      }
    }

    if (sort && sort.length > 0) {
      for (const s of sort) {
        query = query.orderBy(s.field, s.direction ?? 'asc');
      }
    } else {
      query = query.orderBy('started_at', 'desc');
    }

    if (offset !== undefined) {
      query = query.offset(offset);
    }
    if (limit !== undefined) {
      query = query.limit(limit);
    }

    return query.execute();
  }

  async countMany(filter?: WorkoutExecutionFilter): Promise<number> {
    let query = this.db.selectFrom('workout_executions').select((eb) => eb.fn.countAll<number>().as('count'));

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.workoutScheduleId) {
      query = query.where('workout_schedule_id', '=', filter.workoutScheduleId);
    }
    if (filter?.source) {
      query = query.where('source', '=', filter.source);
    }
    if (filter?.dateFrom) {
      query = query.where('started_at', '>=', filter.dateFrom);
    }
    if (filter?.dateTo) {
      query = query.where('started_at', '<=', filter.dateTo);
    }
    if (filter?.completedDateFrom) {
      query = query.where('completed_at', '>=', filter.completedDateFrom);
    }
    if (filter?.completedDateTo) {
      query = query.where('completed_at', '<=', filter.completedDateTo);
    }
    if (filter?.completed !== undefined) {
      if (filter.completed) {
        query = query.where('completed_at', 'is not', null);
      } else {
        query = query.where('completed_at', 'is', null);
      }
    }

    const result = await query.executeTakeFirstOrThrow();
    return Number(result.count);
  }

  async create(data: NewWorkoutExecution): Promise<WorkoutExecution> {
    return this.db.insertInto('workout_executions').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: WorkoutExecutionUpdate): Promise<WorkoutExecution> {
    return this.db
      .updateTable('workout_executions')
      .set({ ...data, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('workout_executions').where('id', '=', id).execute();
  }
}
