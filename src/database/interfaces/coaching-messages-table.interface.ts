import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

import type { Timestamp } from './timestamp';

export interface CoachingMessagesTable {
  id: Generated<string>;
  relationship_id: string;
  sender_id: string;
  content: string;
  workout_schedule_id: string | null;
  is_workout_note: Generated<boolean>;
  attached_workout_id: string | null;
  attached_plan_id: string | null;
  attached_questionnaire_id: string | null;
  read_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type CoachingMessage = Selectable<CoachingMessagesTable>;
export type NewCoachingMessage = Insertable<CoachingMessagesTable>;
export type CoachingMessageUpdate = Updateable<CoachingMessagesTable>;
