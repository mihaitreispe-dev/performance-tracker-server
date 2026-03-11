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
  INTAKE_REMINDER: 'intake_reminder',
  CHECK_IN_REQUEST: 'check_in_request',
  WORKOUT_NOTE_REQUEST: 'workout_note_request',
  SCHEDULED_PROMPT: 'scheduled_prompt',
  // Coach alert notification types
  COACH_ALERT_MISSED_WORKOUT: 'coach_alert_missed_workout',
  COACH_ALERT_HIGH_PAIN: 'coach_alert_high_pain',
  COACH_ALERT_LOW_COMPLIANCE: 'coach_alert_low_compliance',
  COACH_ALERT_INCOMPLETE_INTAKE: 'coach_alert_incomplete_intake',
  COACH_ALERT_HEALTH_CONCERN: 'coach_alert_health_concern',
  // New injury/illness alert types
  COACH_ALERT_NEW_INJURY: 'coach_alert_new_injury',
  COACH_ALERT_NEW_ILLNESS: 'coach_alert_new_illness',
  COACH_ALERT_ONGOING_CONCERN: 'coach_alert_ongoing_concern',
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
  scheduledPromptId?: string;
  promptType?: string;
  // Coach alert data
  athleteName?: string;
  alertType?: string;
  painLevel?: number;
  bodyPart?: string;
  compliancePercentage?: number;
  missedDate?: string;
  metricType?: string;
  metricValue?: number;
  // Injury/Illness alert data
  injuryType?: string;
  isInjury?: boolean;
  illnessType?: string;
  severity?: number;
  startDate?: string;
  daysSinceStart?: number;
  expectedRecoveryDays?: number;
  concernType?: 'injury' | 'illness';
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
