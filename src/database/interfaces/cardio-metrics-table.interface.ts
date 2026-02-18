import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum CardioMetricType {
  HEART_RATE = 'heart_rate',
  POWER = 'power',
  CADENCE = 'cadence',
  PACE = 'pace',
  BREATHING_RATE = 'breathing_rate',
  STRIDE_LENGTH = 'stride_length',
  VERTICAL_OSCILLATION = 'vertical_oscillation',
  GROUND_CONTACT_BALANCE = 'ground_contact_balance',
  ELEVATION = 'elevation',
  SPEED = 'speed',
}

export interface CardioMetricsTable {
  id: Generated<string>;
  workout_execution_id: string;
  metric_type: CardioMetricType;
  recorded_at: Timestamp;
  value: string;
  unit: string;
  created_at: Generated<Timestamp>;
}

export type CardioMetric = Selectable<CardioMetricsTable>;
export type NewCardioMetric = Insertable<CardioMetricsTable>;
export type CardioMetricUpdate = Updateable<CardioMetricsTable>;
