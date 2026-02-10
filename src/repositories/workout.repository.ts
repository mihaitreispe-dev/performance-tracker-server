import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  NewWorkout,
  NewWorkoutItem,
  Workout,
  WorkoutDifficulty,
  WorkoutItem,
  WorkoutType,
  WorkoutUpdate,
} from 'src/database/interfaces';

export interface WorkoutFilter {
  userId?: string;
  type?: WorkoutType;
  difficulty?: WorkoutDifficulty;
  search?: string;
}

export interface WorkoutSort {
  field: 'name' | 'created_at' | 'updated_at';
  direction?: 'asc' | 'desc';
}

export interface WorkoutFindManyOptions {
  filter?: WorkoutFilter;
  sort?: WorkoutSort[];
  offset?: number;
  limit?: number;
}

@Injectable()
export class WorkoutRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<Workout | undefined> {
    return this.db.selectFrom('workouts').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findMany(options: WorkoutFindManyOptions = {}): Promise<Workout[]> {
    const { filter, sort, offset, limit } = options;

    let query = this.db.selectFrom('workouts').selectAll();

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.type) {
      query = query.where('type', '=', filter.type);
    }
    if (filter?.difficulty) {
      query = query.where('difficulty', '=', filter.difficulty);
    }
    if (filter?.search) {
      query = query.where('name', 'ilike', `%${filter.search}%`);
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

  async countMany(filter?: WorkoutFilter): Promise<number> {
    let query = this.db.selectFrom('workouts').select((eb) => eb.fn.countAll<number>().as('count'));

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.type) {
      query = query.where('type', '=', filter.type);
    }
    if (filter?.difficulty) {
      query = query.where('difficulty', '=', filter.difficulty);
    }
    if (filter?.search) {
      query = query.where('name', 'ilike', `%${filter.search}%`);
    }

    const result = await query.executeTakeFirstOrThrow();
    return Number(result.count);
  }

  async create(data: NewWorkout): Promise<Workout> {
    return this.db.insertInto('workouts').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: WorkoutUpdate): Promise<Workout> {
    return this.db.updateTable('workouts').set(data).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('workouts').where('id', '=', id).execute();
  }

  // Workout items

  async createWorkoutItems(data: NewWorkoutItem[]): Promise<WorkoutItem[]> {
    if (data.length === 0) return [];
    return this.db.insertInto('workout_items').values(data).returningAll().execute();
  }

  async findWorkoutItemsByWorkoutId(workoutId: string): Promise<WorkoutItem[]> {
    return this.db
      .selectFrom('workout_items')
      .where('workout_id', '=', workoutId)
      .selectAll()
      .orderBy('position', 'asc')
      .execute();
  }

  async deleteWorkoutItemsByWorkoutId(workoutId: string): Promise<void> {
    await this.db.deleteFrom('workout_items').where('workout_id', '=', workoutId).execute();
  }
}
