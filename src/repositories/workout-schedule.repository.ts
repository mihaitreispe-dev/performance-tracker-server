import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewWorkoutSchedule, WorkoutSchedule, WorkoutScheduleUpdate } from 'src/database/interfaces';

export interface WorkoutScheduleFilter {
  userId?: string;
  workoutId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  completed?: boolean;
}

export interface WorkoutScheduleSort {
  field: 'scheduled_date' | 'created_at' | 'updated_at';
  direction?: 'asc' | 'desc';
}

export interface WorkoutScheduleFindManyOptions {
  filter?: WorkoutScheduleFilter;
  sort?: WorkoutScheduleSort[];
  offset?: number;
  limit?: number;
}

@Injectable()
export class WorkoutScheduleRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<WorkoutSchedule | undefined> {
    return this.db.selectFrom('workout_schedules').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findMany(options: WorkoutScheduleFindManyOptions = {}): Promise<WorkoutSchedule[]> {
    const { filter, sort, offset, limit } = options;
    let query = this.db.selectFrom('workout_schedules').selectAll();

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.workoutId) {
      query = query.where('workout_id', '=', filter.workoutId);
    }
    if (filter?.dateFrom) {
      query = query.where('scheduled_date', '>=', filter.dateFrom);
    }
    if (filter?.dateTo) {
      query = query.where('scheduled_date', '<=', filter.dateTo);
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
      query = query.orderBy('scheduled_date', 'asc');
    }

    if (offset !== undefined) {
      query = query.offset(offset);
    }
    if (limit !== undefined) {
      query = query.limit(limit);
    }

    return query.execute();
  }

  async countMany(filter?: WorkoutScheduleFilter): Promise<number> {
    let query = this.db.selectFrom('workout_schedules').select((eb) => eb.fn.countAll<number>().as('count'));

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.workoutId) {
      query = query.where('workout_id', '=', filter.workoutId);
    }
    if (filter?.dateFrom) {
      query = query.where('scheduled_date', '>=', filter.dateFrom);
    }
    if (filter?.dateTo) {
      query = query.where('scheduled_date', '<=', filter.dateTo);
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

  async create(data: NewWorkoutSchedule): Promise<WorkoutSchedule> {
    return this.db.insertInto('workout_schedules').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async createMany(data: NewWorkoutSchedule[]): Promise<WorkoutSchedule[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insertInto('workout_schedules').values(data).returningAll().execute();
  }

  async updateById(id: string, data: WorkoutScheduleUpdate): Promise<WorkoutSchedule> {
    return this.db
      .updateTable('workout_schedules')
      .set({ ...data, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('workout_schedules').where('id', '=', id).execute();
  }
}
