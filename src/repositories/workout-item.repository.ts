import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, WorkoutItem } from 'src/database/interfaces';

export interface WorkoutItemFilter {
  workoutId?: string;
}

@Injectable()
export class WorkoutItemRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findMany(filter?: WorkoutItemFilter): Promise<WorkoutItem[]> {
    let query = this.db.selectFrom('workout_items').selectAll();

    if (filter?.workoutId) {
      query = query.where('workout_id', '=', filter.workoutId);
    }

    return query.orderBy('position', 'asc').execute();
  }

  async countMany(filter?: WorkoutItemFilter): Promise<number> {
    let query = this.db.selectFrom('workout_items').select((eb) => eb.fn.countAll<number>().as('count'));

    if (filter?.workoutId) {
      query = query.where('workout_id', '=', filter.workoutId);
    }

    const result = await query.executeTakeFirstOrThrow();
    return Number(result.count);
  }
}
