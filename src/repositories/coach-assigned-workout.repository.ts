import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  CoachAssignedWorkout,
  CoachAssignedWorkoutUpdate,
  Database,
  NewCoachAssignedWorkout,
} from 'src/database/interfaces';

export interface CoachAssignedWorkoutFilter {
  coachId?: string;
  athleteId?: string;
  workoutId?: string;
}

@Injectable()
export class CoachAssignedWorkoutRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<CoachAssignedWorkout | undefined> {
    return this.db.selectFrom('coach_assigned_workouts').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findMany(filter: CoachAssignedWorkoutFilter = {}): Promise<CoachAssignedWorkout[]> {
    let query = this.db.selectFrom('coach_assigned_workouts').selectAll();

    if (filter.coachId) {
      query = query.where('coach_id', '=', filter.coachId);
    }
    if (filter.athleteId) {
      query = query.where('athlete_id', '=', filter.athleteId);
    }
    if (filter.workoutId) {
      query = query.where('workout_id', '=', filter.workoutId);
    }

    return query.orderBy('assigned_at', 'desc').execute();
  }

  async create(data: NewCoachAssignedWorkout): Promise<CoachAssignedWorkout> {
    return this.db.insertInto('coach_assigned_workouts').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: CoachAssignedWorkoutUpdate): Promise<CoachAssignedWorkout> {
    return this.db
      .updateTable('coach_assigned_workouts')
      .set(data)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('coach_assigned_workouts').where('id', '=', id).execute();
  }

  async deleteByAthleteId(athleteId: string): Promise<void> {
    await this.db.deleteFrom('coach_assigned_workouts').where('athlete_id', '=', athleteId).execute();
  }
}
