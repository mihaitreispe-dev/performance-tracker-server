import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import type { Timestamp } from './timestamp';

export const ScheduledPromptType = {
  INTAKE_REMINDER: 'intake_reminder',
  CHECK_IN_REQUEST: 'check_in_request',
  WORKOUT_NOTE_REQUEST: 'workout_note_request',
  CUSTOM_PROMPT: 'custom_prompt',
} as const;

export type ScheduledPromptType = (typeof ScheduledPromptType)[keyof typeof ScheduledPromptType];

export const ScheduleFrequency = {
  ONCE: 'once',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  SPECIFIC_DAYS: 'specific_days',
} as const;

export type ScheduleFrequency = (typeof ScheduleFrequency)[keyof typeof ScheduleFrequency];

export interface CoachScheduledPromptsTable {
  id: Generated<string>;
  coach_id: string;
  athlete_id: string | null; // NULL = all active athletes
  prompt_type: ScheduledPromptType;
  title: string;
  message: string | null;
  frequency: ScheduleFrequency;
  days_of_week: ColumnType<number[] | null, number[] | null | undefined, number[] | null>; // 0-6 (Sun-Sat)
  scheduled_time: string; // Time as HH:MM:SS
  timezone: string; // IANA timezone
  start_date: string; // Date as YYYY-MM-DD
  end_date: string | null; // Date as YYYY-MM-DD or null
  next_run_at: Timestamp;
  last_sent_at: Timestamp | null;
  enabled: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type CoachScheduledPrompt = Selectable<CoachScheduledPromptsTable>;
export type NewCoachScheduledPrompt = Insertable<CoachScheduledPromptsTable>;
export type CoachScheduledPromptUpdate = Updateable<CoachScheduledPromptsTable>;
