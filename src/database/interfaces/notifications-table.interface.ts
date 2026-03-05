import type { Generated, Insertable, Selectable, Updateable } from 'kysely';
import type { Timestamp } from './timestamp';

export const NotificationType = {
  MESSAGE: 'message',
  WORKOUT_NOTE: 'workout_note',
  WORKOUT_ASSIGNED: 'workout_assigned',
  PLAN_DEPLOYED: 'plan_deployed',
  INVITATION_RECEIVED: 'invitation_received',
  INVITATION_ACCEPTED: 'invitation_accepted',
  INVITATION_DECLINED: 'invitation_declined',
  WORKOUT_COMPLETED: 'workout_completed',
  WORKOUT_MISSED: 'workout_missed',
} as const;

export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export interface NotificationData {
  athleteId?: string;
  coachId?: string;
  messageId?: string;
  workoutId?: string;
  workoutScheduleId?: string;
  relationshipId?: string;
  workoutName?: string;
  senderName?: string;
}

export interface NotificationsTable {
  id: Generated<string>;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: NotificationData | null;
  read_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

export type Notification = Selectable<NotificationsTable>;
export type NewNotification = Insertable<NotificationsTable>;
export type NotificationUpdate = Updateable<NotificationsTable>;
