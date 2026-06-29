import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/** What advances a quest. Activity types advance in real time (in award());
 *  state types are evaluated by the cron from user_progression. */
export enum QuestObjectiveType {
  WORKOUTS_COMPLETED = 'workouts_completed',
  SNACKS_COMPLETED = 'snacks_completed',
  ACTIVE_DAYS = 'active_days',
  STREAK_REACHED = 'streak_reached',
  LEVEL_REACHED = 'level_reached',
  PLAN_ADHERENCE = 'plan_adherence',
}

export enum QuestPeriod {
  ONE_OFF = 'one_off',
  WEEKLY = 'weekly',
}

export enum QuestStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

/** Coach-authored quest definition (org-scoped). See migration 1774405100000. */
export interface QuestsTable {
  id: Generated<string>;
  organisation_id: string;
  coach_id: string;
  title: string;
  description: ColumnType<string | null, string | null | undefined, string | null>;
  objective_type: QuestObjectiveType;
  target_value: number;
  period: ColumnType<QuestPeriod, QuestPeriod | undefined, QuestPeriod>;
  reward_xp: ColumnType<number, number | undefined, number>;
  /** one_off only — optional absolute due date (DATE read as Date; write 'YYYY-MM-DD'). */
  due_date: ColumnType<Date | null, string | null | undefined, string | null>;
  status: ColumnType<QuestStatus, QuestStatus | undefined, QuestStatus>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type Quest = Selectable<QuestsTable>;
export type NewQuest = Insertable<QuestsTable>;
export type QuestUpdate = Updateable<QuestsTable>;
