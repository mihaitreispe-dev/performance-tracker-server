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
  WorkoutVisibility,
} from 'src/database/interfaces';

export interface WorkoutFilter {
  /** Restrict to rows authored by this user. */
  userId?: string;
  /** Restrict to a specific visibility (personal | org_library). */
  visibility?: WorkoutVisibility;
  /**
   * Visibility/ownership "OR" — show rows where EITHER the caller is
   * the author OR the row's visibility is org_library. Lets athletes
   * see their own personal drafts alongside the org library in one
   * paginated list. Mutually exclusive with `userId` / `visibility`
   * filters; when supplied, those are ignored.
   */
  visibleTo?: {
    userId: string;
    libraryVisibility: WorkoutVisibility;
  };
  type?: WorkoutType;
  difficulty?: WorkoutDifficulty;
  search?: string;
}

export interface WorkoutSort {
  field: 'name' | 'created_at' | 'updated_at';
  direction?: 'asc' | 'desc';
}

export interface WorkoutFindManyOptions {
  /** Active organisation id. Workouts are strictly tenant-scoped. */
  organisationId: string;
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

  /**
   * Bulk fetch workouts by IDs. Caller is responsible for tenant-checking the results.
   */
  async findByIds(ids: string[]): Promise<Workout[]> {
    if (ids.length === 0) return [];

    return this.db.selectFrom('workouts').where('id', 'in', ids).selectAll().execute();
  }

  async findMany(options: WorkoutFindManyOptions): Promise<Workout[]> {
    const { organisationId, filter, sort, offset, limit } = options;

    let query = this.db
      .selectFrom('workouts')
      .where('organisation_id', '=', organisationId)
      .selectAll();

    // visibleTo composes ownership with library visibility in one
    // OR group; if the caller passed it, the more granular userId /
    // visibility filters are dropped (they'd shrink the result set
    // below the intended union).
    if (filter?.visibleTo) {
      const { userId, libraryVisibility } = filter.visibleTo;
      query = query.where((eb) =>
        eb.or([eb('user_id', '=', userId), eb('visibility', '=', libraryVisibility)]),
      );
    } else {
      if (filter?.userId) {
        query = query.where('user_id', '=', filter.userId);
      }
      if (filter?.visibility) {
        query = query.where('visibility', '=', filter.visibility);
      }
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

  async countMany(organisationId: string, filter?: WorkoutFilter): Promise<number> {
    let query = this.db
      .selectFrom('workouts')
      .where('organisation_id', '=', organisationId)
      .select((eb) => eb.fn.countAll<number>().as('count'));

    if (filter?.visibleTo) {
      const { userId, libraryVisibility } = filter.visibleTo;
      query = query.where((eb) =>
        eb.or([eb('user_id', '=', userId), eb('visibility', '=', libraryVisibility)]),
      );
    } else {
      if (filter?.userId) {
        query = query.where('user_id', '=', filter.userId);
      }
      if (filter?.visibility) {
        query = query.where('visibility', '=', filter.visibility);
      }
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
