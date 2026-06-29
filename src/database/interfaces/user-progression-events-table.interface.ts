import { ColumnType, Generated, Insertable, Selectable } from 'kysely';

import { Timestamp } from './timestamp';

export enum ProgressionSourceType {
  WORKOUT_EXECUTION = 'workout_execution',
  SNACK_COMPLETION = 'snack_completion',
  /** Quest reward XP — source_id is the quest_assignment.id (exactly-once). */
  QUEST_REWARD = 'quest_reward',
}

/**
 * Append-only XP ledger — see migration 1774404900000. The UNIQUE
 * (source_type, source_id) index is the exactly-once gate: an award inserts a
 * row ON CONFLICT DO NOTHING and only bumps XP/level/streak when the insert was
 * new, so re-finishing a workout or replaying an offline completion never
 * double-awards. Also the audit trail + Phase-2 recap source.
 *
 * Pure log — no update path, so no Updateable export.
 */
export interface UserProgressionEventsTable {
  id: Generated<string>;
  user_id: string;
  organisation_id: string;
  source_type: ProgressionSourceType;
  source_id: string;
  xp_awarded: number;
  /** jsonb — write JSON.stringify, read a parsed object. Defaults to '{}'. */
  metadata: ColumnType<Record<string, unknown>, string | undefined, string>;
  created_at: Generated<Timestamp>;
}

export type UserProgressionEvent = Selectable<UserProgressionEventsTable>;
export type NewUserProgressionEvent = Insertable<UserProgressionEventsTable>;
