import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewWorkoutPlanItem, WorkoutPlanItem } from 'src/database/interfaces';

export interface WorkoutPlanItemFilter {
  workoutPlanId?: string;
  workoutId?: string;
}

export interface WorkoutPlanItemSort {
  field: 'week_number' | 'day_of_week' | 'created_at';
  direction?: 'asc' | 'desc';
}

export interface WorkoutPlanItemFindManyOptions {
  filter?: WorkoutPlanItemFilter;
  sort?: WorkoutPlanItemSort[];
  offset?: number;
  limit?: number;
}

@Injectable()
export class WorkoutPlanItemRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<WorkoutPlanItem | undefined> {
    return this.db.selectFrom('workout_plan_items').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findMany(options: WorkoutPlanItemFindManyOptions = {}): Promise<WorkoutPlanItem[]> {
    const { filter, sort, offset, limit } = options;
    let query = this.db.selectFrom('workout_plan_items').selectAll();

    if (filter?.workoutPlanId) {
      query = query.where('workout_plan_id', '=', filter.workoutPlanId);
    }
    if (filter?.workoutId) {
      query = query.where('workout_id', '=', filter.workoutId);
    }

    if (sort && sort.length > 0) {
      for (const s of sort) {
        query = query.orderBy(s.field, s.direction ?? 'asc');
      }
    } else {
      query = query.orderBy('week_number', 'asc').orderBy('day_of_week', 'asc');
    }

    if (offset !== undefined) {
      query = query.offset(offset);
    }
    if (limit !== undefined) {
      query = query.limit(limit);
    }

    return query.execute();
  }

  async countMany(filter?: WorkoutPlanItemFilter): Promise<number> {
    let query = this.db.selectFrom('workout_plan_items').select((eb) => eb.fn.countAll<number>().as('count'));

    if (filter?.workoutPlanId) {
      query = query.where('workout_plan_id', '=', filter.workoutPlanId);
    }
    if (filter?.workoutId) {
      query = query.where('workout_id', '=', filter.workoutId);
    }

    const result = await query.executeTakeFirstOrThrow();
    return Number(result.count);
  }

  async create(data: NewWorkoutPlanItem): Promise<WorkoutPlanItem> {
    return this.db.insertInto('workout_plan_items').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('workout_plan_items').where('id', '=', id).execute();
  }

  async deleteByPlanId(workoutPlanId: string): Promise<void> {
    await this.db.deleteFrom('workout_plan_items').where('workout_plan_id', '=', workoutPlanId).execute();
  }
}
