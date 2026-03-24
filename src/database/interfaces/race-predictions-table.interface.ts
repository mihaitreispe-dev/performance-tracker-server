import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export const PredictionStatus = {
  CURRENT: 'current',
  HISTORICAL: 'historical',
  SUPERSEDED: 'superseded',
} as const;

export type PredictionStatus = (typeof PredictionStatus)[keyof typeof PredictionStatus];

export const GoalAchievability = {
  VERY_LIKELY: 'very_likely',
  LIKELY: 'likely',
  POSSIBLE: 'possible',
  UNLIKELY: 'unlikely',
} as const;

export type GoalAchievability = (typeof GoalAchievability)[keyof typeof GoalAchievability];

export const RaceSport = {
  RUN: 'run',
  BIKE: 'bike',
  SWIM: 'swim',
  TRIATHLON: 'triathlon',
} as const;

export type RaceSport = (typeof RaceSport)[keyof typeof RaceSport];

export interface SegmentTarget {
  segment_number: number;
  distance_meters: number;
  target_time_seconds: number;
  target_pace_per_km: number;
  cumulative_time_seconds: number;
  notes?: string;
}

export interface RacePredictionMetadata {
  algorithms_used: string[];
  input_metrics: {
    vo2max?: number;
    vo2max_confidence?: number;
    ftp?: number;
    lthr?: number;
    ltp?: number;
    ctl?: number;
    atl?: number;
    tsb?: number;
    projected_tsb?: number;
  };
  personal_records_used?: {
    distance_meters: number;
    time_seconds: number;
    date: string;
  }[];
  adjustments?: {
    taper_factor?: number;
    elevation_factor?: number;
    weather_factor?: number;
  };
  ensemble_weights?: Record<string, number>;
  prediction_variance?: number;
  generated_by?: 'daily_cron' | 'backfill' | 'manual' | 'quick';
  prediction_date?: string;
}

export interface RacePredictionsTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;
  athlete_race_id: ColumnType<string | null, string | null, string | null>;
  sport: string;
  distance_meters: ColumnType<number, number, number>;
  race_date: ColumnType<Date | null, Date | string | null, Date | string | null>;
  predicted_time_seconds: ColumnType<number, number, number>;
  confidence_lower_seconds: ColumnType<number, number, number>;
  confidence_upper_seconds: ColumnType<number, number, number>;
  confidence_score: ColumnType<string, string | number, string | number>;
  target_pace_per_km: ColumnType<string | null, string | number | null, string | number | null>;
  target_power_watts: ColumnType<number | null, number | null, number | null>;
  segment_targets: ColumnType<SegmentTarget[] | null, SegmentTarget[] | null, SegmentTarget[] | null>;
  risk_score: ColumnType<number | null, number | null, number | null>;
  risk_factors: ColumnType<string[] | null, string[] | null, string[] | null>;
  goal_time_seconds: ColumnType<number | null, number | null, number | null>;
  goal_achievability: ColumnType<string | null, string | null, string | null>;
  status: string;
  metadata: ColumnType<RacePredictionMetadata | null, RacePredictionMetadata | null, RacePredictionMetadata | null>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type RacePrediction = Selectable<RacePredictionsTable>;
export type NewRacePrediction = Insertable<RacePredictionsTable>;
export type UpdateRacePrediction = Updateable<RacePredictionsTable>;
