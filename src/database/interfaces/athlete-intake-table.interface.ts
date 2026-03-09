import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export type EnduranceSport = 'running' | 'cycling' | 'swimming' | 'triathlon' | 'other';

export interface AthleteIntakeTable {
  id: Generated<string>;
  user_id: string;
  coach_id: string;

  // Goals
  primary_goals: Generated<string[]>;

  // Availability
  training_days_per_week: number | null;
  preferred_session_duration: number | null;
  available_days: string[] | null;

  // Fitness Level
  experience_level: string | null;
  current_activity_level: string | null;

  // Health & Limitations
  injuries_limitations: string | null;
  medical_conditions: string | null;

  // Equipment & Environment
  equipment_access: string[] | null;
  training_location: string | null;

  // Sport-specific (legacy fields - kept for backward compatibility)
  primary_sport: string | null;
  competitive_events: string | null;

  // Endurance sport (structured fields)
  endurance_sport: EnduranceSport | null;
  endurance_sport_other: string | null;
  target_events: string[] | null;
  target_event_other: string | null;

  // Additional context
  additional_notes: string | null;

  // Completion tracking
  completed_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type AthleteIntake = Selectable<AthleteIntakeTable>;
export type NewAthleteIntake = Insertable<AthleteIntakeTable>;
export type AthleteIntakeUpdate = Updateable<AthleteIntakeTable>;
