import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/** System goal types auto-advance on activity; 'custom' is user-managed. */
export enum UserGoalType {
  WORKOUTS_COMPLETED = 'workouts_completed',
  SNACKS_COMPLETED = 'snacks_completed',
  ACTIVE_DAYS = 'active_days',
  CUSTOM = 'custom',
}

export enum UserGoalPeriod {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  ONGOING = 'ongoing',
}

export enum UserGoalStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

/**
 * A user's self-selected goal (the autonomy pillar). See migration
 * 1774404900000. System goal types are advanced by the progression service on
 * workout/snack activity; 'custom' goals are advanced only by the user.
 */
export interface UserGoalsTable {
  id: Generated<string>;
  user_id: string;
  organisation_id: string;
  goal_type: UserGoalType;
  title: ColumnType<string | null, string | null | undefined, string | null>;
  target_value: number;
  current_value: ColumnType<number, number | undefined, number>;
  unit: ColumnType<string | null, string | null | undefined, string | null>;
  period: ColumnType<UserGoalPeriod, UserGoalPeriod | undefined, UserGoalPeriod>;
  period_anchor: ColumnType<string | null, string | null | undefined, string | null>;
  status: ColumnType<UserGoalStatus, UserGoalStatus | undefined, UserGoalStatus>;
  completed_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type UserGoal = Selectable<UserGoalsTable>;
export type NewUserGoal = Insertable<UserGoalsTable>;
export type UserGoalUpdate = Updateable<UserGoalsTable>;
