import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum SeasonStatus {
  UPCOMING = 'upcoming',
  ACTIVE = 'active',
  ENDED = 'ended',
}

/**
 * A GLOBAL system-reference season calendar (no organisation_id, no RLS — like
 * platform content). The `theme` drives the seasonal cosmetic ladder + world
 * art. "Season points" are derived (XP-ledger sum over [starts_on, ends_on]),
 * never stored. See migration 1774405200000.
 */
export interface SeasonsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  theme: string;
  /** Inclusive window. DATE read back as Date; write 'YYYY-MM-DD'. Normalize with toDayString. */
  starts_on: ColumnType<Date, string, string>;
  ends_on: ColumnType<Date, string, string>;
  status: ColumnType<SeasonStatus, SeasonStatus | undefined, SeasonStatus>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type Season = Selectable<SeasonsTable>;
export type NewSeason = Insertable<SeasonsTable>;
export type SeasonUpdate = Updateable<SeasonsTable>;
