import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * Scheduled snack rows — see migration 1774404100000. Mirrors
 * workout_schedules: a user's intent to do a given snack on a given
 * date. `completed_at` is nullable (planned vs done); `scheduled_date`
 * is a DATE (no time component) just like workout schedules.
 */
export interface SnackSchedulesTable {
  id: Generated<string>;
  user_id: string;
  content_item_id: string;
  organisation_id: string;
  scheduled_date: Timestamp;
  completed_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type SnackSchedule = Selectable<SnackSchedulesTable>;
export type NewSnackSchedule = Insertable<SnackSchedulesTable>;
export type SnackScheduleUpdate = Updateable<SnackSchedulesTable>;
