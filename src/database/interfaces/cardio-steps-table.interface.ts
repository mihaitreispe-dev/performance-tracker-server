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
  hr_min: number | null;
  hr_max: number | null;
  notes: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type CardioStep = Selectable<CardioStepsTable>;
export type NewCardioStep = Insertable<CardioStepsTable>;
export type CardioStepUpdate = Updateable<CardioStepsTable>;
