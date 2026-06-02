import { ColumnType, Generated, Insertable, Selectable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * Append-only telemetry rows for the workout player (spec F2). See
 * the 1774402900000 migration for the full design notes — schema
 * choices, index strategy, retention policy.
 *
 * No `Updateable` export — telemetry events are immutable post-insert.
 */
export interface PlayerQoeEventsTable {
  id: Generated<string>;
  user_id: string | null;
  organisation_id: string | null;
  event_type: string;
  metric: ColumnType<Record<string, unknown>, Record<string, unknown> | undefined, never>;
  created_at: Generated<Timestamp>;
}

export type PlayerQoeEvent = Selectable<PlayerQoeEventsTable>;
export type NewPlayerQoeEvent = Insertable<PlayerQoeEventsTable>;
