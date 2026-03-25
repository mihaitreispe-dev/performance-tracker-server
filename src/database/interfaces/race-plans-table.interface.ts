import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export const PacingStrategy = {
  EVEN: 'even',
  NEGATIVE_SPLIT: 'negative_split',
  CONSERVATIVE: 'conservative',
  PROGRESSIVE: 'progressive',
} as const;

export type PacingStrategy = (typeof PacingStrategy)[keyof typeof PacingStrategy];

export const RacePlanStatus = {
  ACTIVE: 'active',
  SUPERSEDED: 'superseded',
  ARCHIVED: 'archived',
} as const;

export type RacePlanStatus = (typeof RacePlanStatus)[keyof typeof RacePlanStatus];

export const HeatStressLevel = {
  NONE: 'none',
  LOW: 'low',
  MODERATE: 'moderate',
  HIGH: 'high',
  EXTREME: 'extreme',
} as const;

export type HeatStressLevel = (typeof HeatStressLevel)[keyof typeof HeatStressLevel];

export interface CourseSegment {
  segment_number: number;
  start_distance_meters: number;
  end_distance_meters: number;
  distance_meters: number;
  elevation_start_meters: number;
  elevation_end_meters: number;
  elevation_gain_meters: number;
  elevation_loss_meters: number;
  average_grade_percent: number;
  base_pace_seconds_per_km: number;
  adjusted_pace_seconds_per_km: number;
  segment_time_seconds: number;
  cumulative_time_seconds: number;
  terrain_type?: string;
  notes?: string;
}

export interface EffortZone {
  segment_number: number;
  zone_name: string; // 'Warmup', 'Race Pace', 'Tempo', 'Threshold'
  target_hr_min?: number;
  target_hr_max?: number;
  target_pace_min_seconds_per_km: number;
  target_pace_max_seconds_per_km: number;
  rpe_scale: number; // 1-10
  description: string;
}

export interface NutritionTiming {
  time_elapsed_minutes: number;
  distance_km: number;
  carbs_grams: number;
  hydration_ml: number;
  notes?: string;
}

export interface CaffeineStrategy {
  pre_race_mg: number;
  pre_race_timing_minutes: number; // before start
  on_course_mg?: number;
  on_course_timing_minutes?: number; // after start
}

export interface EnergyManagementPlan {
  carb_loading_days_before: number;
  race_morning_carbs_grams: number;
  race_morning_timing_hours_before: number;
  on_course_nutrition: NutritionTiming[];
  total_carbs_per_hour: number;
  total_hydration_ml_per_hour: number;
  caffeine_strategy?: CaffeineStrategy;
}

export interface MentalCheckpoint {
  distance_km: number;
  percentage_complete: number;
  message: string;
  advice: string;
}

export interface FatigueModel {
  baseline_fade_factor: number; // e.g., 1.03 = 3% slowdown expected
  critical_fatigue_point_km: number;
  mental_checkpoints: MentalCheckpoint[];
  pacing_guidance: string;
}

export interface WeatherAdjustments {
  temperature_impact_seconds: number;
  humidity_impact_seconds: number;
  wind_impact_seconds: number;
  total_impact_seconds: number;
  total_impact_percent: number;
  heat_stress_level: string;
  hydration_multiplier: number;
  pacing_advice: string;
  risk_warnings?: string[];
}

export interface RacePlanMetadata {
  created_by: 'athlete' | 'coach' | 'system';
  creator_id?: string;
  weather_last_updated?: string;
  course_based: boolean;
  gpx_file_hash?: string;
  prediction_algorithm?: string;
  notes?: string;
}

export interface RacePlansTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;
  athlete_race_id: string;
  race_prediction_id: ColumnType<string | null, string | null, string | null>;
  predicted_finish_time_seconds: ColumnType<number, number, number>;
  target_finish_time_seconds: ColumnType<number | null, number | null, number | null>;
  pacing_strategy: string;
  negative_split_ratio: ColumnType<string | null, string | number | null, string | number | null>;
  segment_splits: ColumnType<CourseSegment[], CourseSegment[], CourseSegment[]>;
  effort_zones: ColumnType<EffortZone[], EffortZone[], EffortZone[]>;
  energy_management: ColumnType<EnergyManagementPlan, EnergyManagementPlan, EnergyManagementPlan>;
  fatigue_model: ColumnType<FatigueModel, FatigueModel, FatigueModel>;
  forecast_temperature_celsius: ColumnType<string | null, string | number | null, string | number | null>;
  forecast_humidity_percent: ColumnType<number | null, number | null, number | null>;
  forecast_wind_speed_kmh: ColumnType<string | null, string | number | null, string | number | null>;
  weather_adjustments: ColumnType<WeatherAdjustments | null, WeatherAdjustments | null, WeatherAdjustments | null>;
  warmup_protocol: string;
  race_day_checklist: ColumnType<string[], string[], string[]>;
  key_advice: ColumnType<string[], string[], string[]>;
  status: string;
  plan_version: ColumnType<number, number, number>;
  metadata: ColumnType<RacePlanMetadata | null, RacePlanMetadata | null, RacePlanMetadata | null>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type RacePlan = Selectable<RacePlansTable>;
export type NewRacePlan = Insertable<RacePlansTable>;
export type UpdateRacePlan = Updateable<RacePlansTable>;
