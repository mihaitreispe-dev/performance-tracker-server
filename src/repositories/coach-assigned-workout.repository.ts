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
  /** Active organisation id. Assigned-workout listings are strictly tenant-scoped. */
  organisationId: string;
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

  async findMany(filter: CoachAssignedWorkoutFilter): Promise<CoachAssignedWorkout[]> {
    let query = this.db
      .selectFrom('coach_assigned_workouts')
      .where('organisation_id', '=', filter.organisationId)
      .selectAll();

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

  /**
   * Remove every workout assigned to an athlete within one org. A user can be
   * an athlete in several orgs, so severing a relationship (or revoking a
   * membership) in one org must not wipe the assigned workouts they still have
   * in another — hence the mandatory org scope.
   */
  async deleteByAthleteInOrg(athleteId: string, organisationId: string): Promise<void> {
    await this.db
      .deleteFrom('coach_assigned_workouts')
      .where('athlete_id', '=', athleteId)
      .where('organisation_id', '=', organisationId)
      .execute();
  }

  /**
   * Drop everything a coach has assigned within one org — used when the coach
   * themselves is deprovisioned from that org and their athletes lose them.
   */
  async deleteByCoachInOrg(coachId: string, organisationId: string): Promise<void> {
    await this.db
      .deleteFrom('coach_assigned_workouts')
      .where('coach_id', '=', coachId)
      .where('organisation_id', '=', organisationId)
      .execute();
  }
}
