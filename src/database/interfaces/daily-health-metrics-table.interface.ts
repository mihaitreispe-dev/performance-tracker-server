import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';
import { WearableProvider } from './wearable-provider-connections-table.interface';

export enum HealthMetricType {
  HRV = 'hrv',
  RESTING_HEART_RATE = 'resting_heart_rate',
  BODY_BATTERY = 'body_battery',
  READINESS_SCORE = 'readiness_score',
  STRAIN_SCORE = 'strain_score',
  RECOVERY_SCORE = 'recovery_score',
  STRESS_SCORE = 'stress_score',
  SLEEP_SCORE = 'sleep_score',
  ACTIVITY_SCORE = 'activity_score',
  VO2_MAX = 'vo2_max',
  RESPIRATORY_RATE = 'respiratory_rate',
  BLOOD_OXYGEN = 'blood_oxygen',
  STEPS = 'steps',
  ACTIVE_CALORIES = 'active_calories',
  DISTANCE = 'distance',
}

export interface HealthMetricMetadata {
  // Additional context depending on metric type
  [key: string]: unknown;
}

export interface DailyHealthMetricsTable {
  id: Generated<string>;
  user_id: string;
  metric_date: Date;
  metric_type: HealthMetricType;
  value: string; // Stored as decimal
  unit: string | null;
  provider: WearableProvider;
  external_id: string | null;
  recorded_at: Timestamp | null;
  metadata: HealthMetricMetadata | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type DailyHealthMetric = Selectable<DailyHealthMetricsTable>;
export type NewDailyHealthMetric = Insertable<DailyHealthMetricsTable>;
export type DailyHealthMetricUpdate = Updateable<DailyHealthMetricsTable>;
