import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum UnlockSource {
  SEASON = 'season',
  LEADERBOARD = 'leaderboard',
  OTHER = 'other',
}

/**
 * The generic non-level cosmetic-unlock ledger (per-user-per-org). Level
 * cosmetics stay deterministic (unlockLevel <= level, no row here); seasonal +
 * leaderboard cosmetics are EARNED and recorded here. Idempotent grants via the
 * UNIQUE (user_id, organisation_id, cosmetic_id). See migration 1774405200000.
 */
export interface UserUnlocksTable {
  id: Generated<string>;
  user_id: string;
  organisation_id: string;
  cosmetic_id: string;
  source: ColumnType<UnlockSource, UnlockSource | undefined, UnlockSource>;
  season_id: string | null;
  unlocked_at: Generated<Timestamp>;
  created_at: Generated<Timestamp>;
}

export type UserUnlock = Selectable<UserUnlocksTable>;
export type NewUserUnlock = Insertable<UserUnlocksTable>;
export type UserUnlockUpdate = Updateable<UserUnlocksTable>;
