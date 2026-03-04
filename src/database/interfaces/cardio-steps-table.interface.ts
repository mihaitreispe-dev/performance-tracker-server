import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum CardioStepType {
  WARM_UP = 'warm_up',
  COOL_DOWN = 'cool_down',
  ACTIVITY = 'activity',
  REST = 'rest',
}

export enum CardioStepMode {
  DURATION = 'duration',
  DISTANCE = 'distance',
}

export interface CardioStepsTable {
  id: Generated<string>;
  type: CardioStepType;
  mode: CardioStepMode;
  duration: number | null;
  distance: number | null;
  // HR targets (bpm)
  hr_min: number | null;
  hr_max: number | null;
  hr_zone: number | null; // Zone reference (1-7)
  // Power targets (watts)
  power_min: number | null;
  power_max: number | null;
  power_zone: number | null; // Zone reference (1-7)
  // Pace targets (seconds per km)
  pace_min: number | null;
  pace_max: number | null;
  pace_zone: number | null; // Zone reference (1-7)
  // RPE targets (1-10 scale)
  rpe_min: number | null;
  rpe_max: number | null;
  rpe_zone: number | null; // Zone reference (1-7)
  notes: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type CardioStep = Selectable<CardioStepsTable>;
export type NewCardioStep = Insertable<CardioStepsTable>;
export type CardioStepUpdate = Updateable<CardioStepsTable>;
