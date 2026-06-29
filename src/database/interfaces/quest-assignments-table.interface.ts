import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { QuestObjectiveType, QuestPeriod } from './quests-table.interface';
import { Timestamp } from './timestamp';

export enum QuestAssignmentStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
  ARCHIVED = 'archived',
}

/**
 * A coach-authored quest assigned to one athlete for one window. Snapshots the
 * definition's objective/target/reward/period so a later edit to the quest
 * never alters a live window. See migration 1774405100000.
 */
export interface QuestAssignmentsTable {
  id: Generated<string>;
  quest_id: string;
  organisation_id: string;
  user_id: string;
  assigned_by_coach_id: string;
  objective_type: QuestObjectiveType;
  target_value: number;
  reward_xp: number;
  period: QuestPeriod;
  progress_value: ColumnType<number, number | undefined, number>;
  status: ColumnType<QuestAssignmentStatus, QuestAssignmentStatus | undefined, QuestAssignmentStatus>;
  /** Inclusive window. DATE read back as Date; write 'YYYY-MM-DD'. Normalize with toDayString. */
  window_start: ColumnType<Date, string, string>;
  window_end: ColumnType<Date | null, string | null | undefined, string | null>;
  completed_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type QuestAssignment = Selectable<QuestAssignmentsTable>;
export type NewQuestAssignment = Insertable<QuestAssignmentsTable>;
export type QuestAssignmentUpdate = Updateable<QuestAssignmentsTable>;
