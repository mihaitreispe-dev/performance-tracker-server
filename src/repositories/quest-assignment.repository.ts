import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  NewQuestAssignment,
  QuestAssignment,
  QuestAssignmentStatus,
  QuestObjectiveType,
} from 'src/database/interfaces';

type Executor = Kysely<Database>;

/** Per-athlete quest instances. See migration 1774405100000. */
@Injectable()
export class QuestAssignmentRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  /** Idempotent on (quest_id, user_id, window_start) — safe for re-assign + weekly roll. */
  async assign(data: NewQuestAssignment, exec: Executor = this.db): Promise<QuestAssignment | undefined> {
    return exec
      .insertInto('quest_assignments')
      .values(data)
      .onConflict((oc) => oc.columns(['quest_id', 'user_id', 'window_start']).doNothing())
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Real-time bump (called from award()): advance active assignments of an
   * objective type whose window covers `today`. Increment-only; never completes.
   */
  async advanceProgress(
    userId: string,
    organisationId: string,
    objectiveType: QuestObjectiveType,
    by: number,
    today: string,
    exec: Executor = this.db,
  ): Promise<void> {
    if (by <= 0) return;
    await exec
      .updateTable('quest_assignments')
      .set({ progress_value: sql`progress_value + ${by}`, updated_at: sql`now()` })
      .where('user_id', '=', userId)
      .where('organisation_id', '=', organisationId)
      .where('objective_type', '=', objectiveType)
      .where('status', '=', QuestAssignmentStatus.ACTIVE)
      .where(sql<boolean>`window_start <= ${today}::date AND (window_end IS NULL OR window_end >= ${today}::date)`)
      .execute();
  }

  /** Cron: all active assignments of a (state-derived) objective type, system-wide. */
  async listActiveByObjective(objectiveType: QuestObjectiveType): Promise<QuestAssignment[]> {
    return this.db
      .selectFrom('quest_assignments')
      .where('status', '=', QuestAssignmentStatus.ACTIVE)
      .where('objective_type', '=', objectiveType)
      .selectAll()
      .execute();
  }

  /** Cron: set an absolute progress value (for streak_reached / level_reached). */
  async setProgress(id: string, value: number, exec: Executor = this.db): Promise<void> {
    await exec
      .updateTable('quest_assignments')
      .set({ progress_value: value, updated_at: sql`now()` })
      .where('id', '=', id)
      .execute();
  }

  /** Cron: active assignments that have reached their target, system-wide. */
  async listCompletable(): Promise<QuestAssignment[]> {
    return this.db
      .selectFrom('quest_assignments')
      .where('status', '=', QuestAssignmentStatus.ACTIVE)
      .where(sql<boolean>`progress_value >= target_value`)
      .selectAll()
      .execute();
  }

  async markCompleted(id: string, exec: Executor = this.db): Promise<void> {
    await exec
      .updateTable('quest_assignments')
      .set({ status: QuestAssignmentStatus.COMPLETED, completed_at: new Date(), updated_at: sql`now()` })
      .where('id', '=', id)
      .where('status', '=', QuestAssignmentStatus.ACTIVE)
      .execute();
  }

  async markExpired(id: string): Promise<void> {
    await this.db
      .updateTable('quest_assignments')
      .set({ status: QuestAssignmentStatus.EXPIRED, updated_at: sql`now()` })
      .where('id', '=', id)
      .where('status', '=', QuestAssignmentStatus.ACTIVE)
      .execute();
  }

  /** Cron: active assignments whose window has ended (for expiry / weekly roll). */
  async listEndedActive(today: string): Promise<QuestAssignment[]> {
    return this.db
      .selectFrom('quest_assignments')
      .where('status', '=', QuestAssignmentStatus.ACTIVE)
      .where(sql<boolean>`window_end IS NOT NULL AND window_end < ${today}::date`)
      .selectAll()
      .execute();
  }

  /** Athlete-facing: active assignments for the journey, joined to the quest title. */
  async listActiveForUserWithQuest(userId: string, organisationId: string) {
    return this.db
      .selectFrom('quest_assignments as qa')
      .innerJoin('quests as q', 'q.id', 'qa.quest_id')
      .where('qa.user_id', '=', userId)
      .where('qa.organisation_id', '=', organisationId)
      .where('qa.status', '=', QuestAssignmentStatus.ACTIVE)
      .select([
        'qa.id as id',
        'qa.objective_type as objectiveType',
        'qa.target_value as targetValue',
        'qa.progress_value as progressValue',
        'qa.reward_xp as rewardXp',
        'qa.period as period',
        'qa.status as status',
        'qa.window_end as windowEnd',
        'q.title as title',
        'q.description as description',
      ])
      .orderBy('qa.created_at', 'asc')
      .execute();
  }

  /** Count quests completed in a window (the recap). */
  async countCompletedSince(userId: string, organisationId: string, since: Date): Promise<number> {
    const r = await this.db
      .selectFrom('quest_assignments')
      .select((eb) => eb.fn.countAll().as('c'))
      .where('user_id', '=', userId)
      .where('organisation_id', '=', organisationId)
      .where('status', '=', QuestAssignmentStatus.COMPLETED)
      .where('completed_at', '>=', since)
      .executeTakeFirst();
    return Number(r?.c ?? 0);
  }

  /** Coach-facing: an athlete's non-archived assignments, joined to the quest title. */
  async listForAthleteWithQuest(userId: string, organisationId: string) {
    return this.db
      .selectFrom('quest_assignments as qa')
      .innerJoin('quests as q', 'q.id', 'qa.quest_id')
      .where('qa.user_id', '=', userId)
      .where('qa.organisation_id', '=', organisationId)
      .where('qa.status', '!=', QuestAssignmentStatus.ARCHIVED)
      .select([
        'qa.id as id',
        'qa.quest_id as questId',
        'qa.objective_type as objectiveType',
        'qa.target_value as targetValue',
        'qa.progress_value as progressValue',
        'qa.reward_xp as rewardXp',
        'qa.period as period',
        'qa.status as status',
        'qa.window_end as windowEnd',
        'q.title as title',
      ])
      .orderBy('qa.created_at', 'desc')
      .execute();
  }
}
