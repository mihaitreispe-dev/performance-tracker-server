import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  NewUserGoal,
  UserGoal,
  UserGoalStatus,
  UserGoalType,
  UserGoalUpdate,
} from 'src/database/interfaces';

type Executor = Kysely<Database>;

/** Self-selected goals. See migration 1774404900000. */
@Injectable()
export class UserGoalRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async create(data: NewUserGoal): Promise<UserGoal> {
    return this.db.insertInto('user_goals').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async findByIdForUser(
    id: string,
    userId: string,
    organisationId: string,
  ): Promise<UserGoal | undefined> {
    return this.db
      .selectFrom('user_goals')
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .executeTakeFirst();
  }

  /** All non-archived goals for a user+org (active + completed), oldest first. */
  async listForUser(
    userId: string,
    organisationId: string,
    opts?: { includeArchived?: boolean },
  ): Promise<UserGoal[]> {
    let q = this.db
      .selectFrom('user_goals')
      .where('user_id', '=', userId)
      .where('organisation_id', '=', organisationId);
    if (!opts?.includeArchived) q = q.where('status', '!=', UserGoalStatus.ARCHIVED);
    return q.selectAll().orderBy('created_at', 'asc').execute();
  }

  /** Count goals completed in a window (the recap). */
  async countCompletedSince(userId: string, organisationId: string, since: Date): Promise<number> {
    const r = await this.db
      .selectFrom('user_goals')
      .select((eb) => eb.fn.countAll().as('c'))
      .where('user_id', '=', userId)
      .where('organisation_id', '=', organisationId)
      .where('status', '=', UserGoalStatus.COMPLETED)
      .where('completed_at', '>=', since)
      .executeTakeFirst();
    return Number(r?.c ?? 0);
  }

  /** Patch a goal, scoped to its owner. Stamps updated_at. */
  async updateForUser(
    id: string,
    userId: string,
    organisationId: string,
    patch: UserGoalUpdate,
  ): Promise<UserGoal | undefined> {
    return this.db
      .updateTable('user_goals')
      .set({ ...patch, updated_at: sql`now()` })
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .where('organisation_id', '=', organisationId)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Advance the user's active goals of a system type by `by`, then flip any
   * that reached their target to completed. Runs inside the award transaction.
   * 'custom' goals are never touched here (user-managed).
   */
  async incrementSystemGoals(
    userId: string,
    organisationId: string,
    goalType: UserGoalType,
    by: number,
    exec: Executor = this.db,
  ): Promise<void> {
    if (by <= 0) return;
    await exec
      .updateTable('user_goals')
      .set({ current_value: sql`current_value + ${by}`, updated_at: sql`now()` })
      .where('user_id', '=', userId)
      .where('organisation_id', '=', organisationId)
      .where('goal_type', '=', goalType)
      .where('status', '=', UserGoalStatus.ACTIVE)
      .execute();
    await exec
      .updateTable('user_goals')
      .set({ status: UserGoalStatus.COMPLETED, completed_at: sql`now()`, updated_at: sql`now()` })
      .where('user_id', '=', userId)
      .where('organisation_id', '=', organisationId)
      .where('goal_type', '=', goalType)
      .where('status', '=', UserGoalStatus.ACTIVE)
      .where((eb) => eb('current_value', '>=', eb.ref('target_value')))
      .execute();
  }
}
