import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * Equipped avatar cosmetics. Opaque blob in Phase 1; Phase 2 validates the
 * equipped ids against the user's owned `user_unlocks`.
 */
export interface AvatarState {
  /** slot (e.g. 'outfit', 'companion') -> cosmetic id */
  equipped?: Record<string, string>;
}

/**
 * One progression row per (user, organisation) — the user's "Journey" state in
 * a given org. See migration 1774404900000. `xp` is the source of truth;
 * `level` is a cached `levelForXp(xp)`. The streak is day-based + forgiving
 * (a single missed day consumes `streak_grace_remaining` instead of resetting).
 */
export interface UserProgressionTable {
  id: Generated<string>;
  user_id: string;
  organisation_id: string;
  xp: ColumnType<number, number | undefined, number>;
  level: ColumnType<number, number | undefined, number>;
  current_streak: ColumnType<number, number | undefined, number>;
  longest_streak: ColumnType<number, number | undefined, number>;
  /**
   * DATE column. The pg driver READS it back as a JS Date (local midnight);
   * we WRITE a 'YYYY-MM-DD' string. Normalize reads via `toDayString`.
   */
  last_active_date: ColumnType<Date | null, string | null | undefined, string | null>;
  streak_grace_remaining: ColumnType<number, number | undefined, number>;
  /** Earned freeze tokens — auto-consumed to save a streak after grace runs out. */
  streak_freezes: ColumnType<number, number | undefined, number>;
  streak_timezone: ColumnType<string | null, string | null | undefined, string | null>;
  /** jsonb — write JSON.stringify, read a parsed object. Defaults to '{}'. */
  avatar_state: ColumnType<AvatarState, string | undefined, string>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type UserProgression = Selectable<UserProgressionTable>;
export type NewUserProgression = Insertable<UserProgressionTable>;
export type UserProgressionUpdate = Updateable<UserProgressionTable>;
