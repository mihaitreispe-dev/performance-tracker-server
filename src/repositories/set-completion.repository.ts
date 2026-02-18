import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewSetCompletion, SetCompletion, SetCompletionUpdate } from 'src/database/interfaces';

export interface SetCompletionFilter {
  workoutExecutionId?: string;
  exerciseInstanceId?: string;
  skipped?: boolean;
}

export interface SetCompletionSort {
  field: 'set_number' | 'completed_at' | 'created_at';
  direction?: 'asc' | 'desc';
}

export interface SetCompletionFindManyOptions {
  filter?: SetCompletionFilter;
  sort?: SetCompletionSort[];
  offset?: number;
  limit?: number;
}

@Injectable()
export class SetCompletionRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<SetCompletion | undefined> {
    return this.db.selectFrom('set_completions').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByExecutionAndSet(
    workoutExecutionId: string,
    exerciseInstanceId: string,
    setNumber: number,
  ): Promise<SetCompletion | undefined> {
    return this.db
      .selectFrom('set_completions')
      .where('workout_execution_id', '=', workoutExecutionId)
      .where('exercise_instance_id', '=', exerciseInstanceId)
      .where('set_number', '=', setNumber)
      .selectAll()
      .executeTakeFirst();
  }

  async findMany(options: SetCompletionFindManyOptions = {}): Promise<SetCompletion[]> {
    const { filter, sort, offset, limit } = options;
    let query = this.db.selectFrom('set_completions').selectAll();

    if (filter?.workoutExecutionId) {
      query = query.where('workout_execution_id', '=', filter.workoutExecutionId);
    }
    if (filter?.exerciseInstanceId) {
      query = query.where('exercise_instance_id', '=', filter.exerciseInstanceId);
    }
    if (filter?.skipped !== undefined) {
      query = query.where('skipped', '=', filter.skipped);
    }

    if (sort && sort.length > 0) {
      for (const s of sort) {
        query = query.orderBy(s.field, s.direction ?? 'asc');
      }
    } else {
      query = query.orderBy('completed_at', 'asc');
    }

    if (offset !== undefined) {
      query = query.offset(offset);
    }
    if (limit !== undefined) {
      query = query.limit(limit);
    }

    return query.execute();
  }

  async countMany(filter?: SetCompletionFilter): Promise<number> {
    let query = this.db.selectFrom('set_completions').select((eb) => eb.fn.countAll<number>().as('count'));

    if (filter?.workoutExecutionId) {
      query = query.where('workout_execution_id', '=', filter.workoutExecutionId);
    }
    if (filter?.exerciseInstanceId) {
      query = query.where('exercise_instance_id', '=', filter.exerciseInstanceId);
    }
    if (filter?.skipped !== undefined) {
      query = query.where('skipped', '=', filter.skipped);
    }

    const result = await query.executeTakeFirstOrThrow();
    return Number(result.count);
  }

  async create(data: NewSetCompletion): Promise<SetCompletion> {
    return this.db.insertInto('set_completions').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async createMany(data: NewSetCompletion[]): Promise<SetCompletion[]> {
    if (data.length === 0) return [];
    return this.db.insertInto('set_completions').values(data).returningAll().execute();
  }

  async updateById(id: string, data: SetCompletionUpdate): Promise<SetCompletion> {
    return this.db
      .updateTable('set_completions')
      .set(data)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('set_completions').where('id', '=', id).execute();
  }

  async deleteByExecutionId(workoutExecutionId: string): Promise<void> {
    await this.db.deleteFrom('set_completions').where('workout_execution_id', '=', workoutExecutionId).execute();
  }
}
