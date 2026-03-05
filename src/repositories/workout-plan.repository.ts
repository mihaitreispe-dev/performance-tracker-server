import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewWorkoutPlan, WorkoutPlan, WorkoutPlanGoal, WorkoutPlanUpdate } from 'src/database/interfaces';

export interface WorkoutPlanFilter {
  userId?: string;
  q?: string;
  goal?: WorkoutPlanGoal;
}

export interface WorkoutPlanSort {
  field: 'name' | 'duration_weeks' | 'created_at' | 'updated_at';
  direction?: 'asc' | 'desc';
}

export interface WorkoutPlanFindManyOptions {
  filter?: WorkoutPlanFilter;
  sort?: WorkoutPlanSort[];
  offset?: number;
  limit?: number;
}

@Injectable()
export class WorkoutPlanRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<WorkoutPlan | undefined> {
    return this.db.selectFrom('workout_plans').where('id', '=', id).selectAll().executeTakeFirst();
  }

  /**
   * Bulk fetch workout plans by IDs - more efficient than multiple findById calls
   */
  async findByIds(ids: string[]): Promise<WorkoutPlan[]> {
    if (ids.length === 0) return [];

    return this.db.selectFrom('workout_plans').where('id', 'in', ids).selectAll().execute();
  }

  async findMany(options: WorkoutPlanFindManyOptions = {}): Promise<WorkoutPlan[]> {
    const { filter, sort, offset, limit } = options;
    let query = this.db.selectFrom('workout_plans').selectAll();

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }

    if (filter?.q) {
      const searchTerm = `%${filter.q.toLowerCase()}%`;
      query = query.where((eb) => eb.or([eb('name', 'ilike', searchTerm), eb('description', 'ilike', searchTerm)]));
    }

    if (filter?.goal) {
      query = query.where('goal', '=', filter.goal);
    }

    if (sort && sort.length > 0) {
      for (const s of sort) {
        query = query.orderBy(s.field, s.direction ?? 'asc');
      }
    } else {
      query = query.orderBy('created_at', 'desc');
    }

    if (offset !== undefined) {
      query = query.offset(offset);
    }
    if (limit !== undefined) {
      query = query.limit(limit);
    }

    return query.execute();
  }

  async countMany(filter?: WorkoutPlanFilter): Promise<number> {
    let query = this.db.selectFrom('workout_plans').select((eb) => eb.fn.countAll<number>().as('count'));

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }

    if (filter?.q) {
      const searchTerm = `%${filter.q.toLowerCase()}%`;
      query = query.where((eb) => eb.or([eb('name', 'ilike', searchTerm), eb('description', 'ilike', searchTerm)]));
    }

    if (filter?.goal) {
      query = query.where('goal', '=', filter.goal);
    }

    const result = await query.executeTakeFirstOrThrow();
    return Number(result.count);
  }

  async create(data: NewWorkoutPlan): Promise<WorkoutPlan> {
    return this.db.insertInto('workout_plans').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: WorkoutPlanUpdate): Promise<WorkoutPlan> {
    return this.db
      .updateTable('workout_plans')
      .set({ ...data, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('workout_plans').where('id', '=', id).execute();
  }
}
