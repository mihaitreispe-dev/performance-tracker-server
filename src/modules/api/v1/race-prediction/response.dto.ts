import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SegmentTargetDTO {
  @ApiProperty({ description: 'Segment number (1-indexed)' })
  segment_number: number;

  @ApiProperty({ description: 'Segment distance in meters' })
  distance_meters: number;

  @ApiProperty({ description: 'Target time for segment in seconds' })
  target_time_seconds: number;

  @ApiProperty({ description: 'Target pace in seconds per km' })
  target_pace_per_km: number;

  @ApiProperty({ description: 'Cumulative time at end of segment' })
  cumulative_time_seconds: number;

  @ApiPropertyOptional({ description: 'Notes for this segment' })
  notes?: string;
}

export class PredictionMethodDTO {
  @ApiProperty({ description: 'Method name (e.g., vdot, riegel_5k, cameron_10k)' })
  name: string;

  @ApiProperty({ description: 'Predicted time from this method in seconds' })
  predicted_seconds: number;

  @ApiProperty({ description: 'Weight given to this method in ensemble' })
  weight: number;

  @ApiProperty({ description: 'Confidence of this method (0-1)' })
  confidence: number;
}

export class RacePredictionDTO {
  @ApiProperty({ description: 'Prediction ID' })
  id: string;

  @ApiProperty({ description: 'User ID' })
  user_id: string;

  @ApiPropertyOptional({ description: 'Athlete race ID if linked to a registered race' })
  athlete_race_id?: string;

  @ApiProperty({ enum: ['run', 'bike', 'swim', 'triathlon'] })
  sport: string;

  @ApiProperty({ description: 'Distance in meters' })
  distance_meters: number;

  @ApiPropertyOptional({ description: 'Race date' })
  race_date?: string;

  @ApiProperty({ description: 'Predicted finish time in seconds' })
  predicted_time_seconds: number;

  @ApiProperty({ description: 'Predicted time formatted (HH:MM:SS)' })
  predicted_time_formatted: string;

  @ApiProperty({ description: 'Lower bound of 95% confidence interval (seconds)' })
  confidence_lower_seconds: number;

  @ApiProperty({ description: 'Upper bound of 95% confidence interval (seconds)' })
  confidence_upper_seconds: number;

  @ApiProperty({ description: 'Overall confidence score (0-1)' })
  confidence_score: number;

  @ApiPropertyOptional({ description: 'Target pace in seconds per km' })
  target_pace_per_km?: number;

  @ApiPropertyOptional({ description: 'Target power in watts (cycling)' })
  target_power_watts?: number;

  @ApiPropertyOptional({ type: [SegmentTargetDTO], description: 'Split predictions' })
  segment_targets?: SegmentTargetDTO[];

  @ApiPropertyOptional({ description: 'Risk score (0-100)' })
  risk_score?: number;

  @ApiPropertyOptional({ type: [String], description: 'Risk factors' })
  risk_factors?: string[];

  @ApiPropertyOptional({ description: 'Goal time in seconds (if set)' })
  goal_time_seconds?: number;

  @ApiPropertyOptional({ enum: ['very_likely', 'likely', 'possible', 'unlikely'] })
  goal_achievability?: string;

  @ApiProperty({ enum: ['current', 'historical', 'superseded'] })
  status: string;

  @ApiProperty({ type: [String], description: 'Algorithms used for prediction' })
  algorithms_used: string[];

  @ApiProperty()
  created_at: string;
}

export class TaperDayDTO {
  @ApiProperty({ description: 'Date (YYYY-MM-DD)' })
  date: string;

  @ApiProperty({ description: 'Suggested TSS for the day' })
  suggested_tss: number;

  @ApiProperty({ description: 'Projected CTL' })
  projected_ctl: number;

  @ApiProperty({ description: 'Projected ATL' })
  projected_atl: number;

  @ApiProperty({ description: 'Projected TSB' })
  projected_tsb: number;

  @ApiProperty({ description: 'Description/recommendation for the day' })
  description: string;
}

export class TaperAssessmentDTO {
  @ApiProperty({ description: 'Projected TSB on race day' })
  projected_tsb: number;

  @ApiProperty({ enum: ['optimal', 'overtapered', 'undertapered', 'fatigued'] })
  assessment: string;

  @ApiProperty({ description: 'Time adjustment factor (1.0 = no change, < 1.0 = faster, > 1.0 = slower)' })
  time_factor: number;

  @ApiProperty({ description: 'Description of assessment' })
  description: string;
}

export class TaperPlanDTO {
  @ApiProperty({ description: 'Race date' })
  race_date: string;

  @ApiProperty({ description: 'Days until race' })
  days_until_race: number;

  @ApiProperty({ description: 'Current CTL' })
  current_ctl: number;

  @ApiProperty({ description: 'Current ATL' })
  current_atl: number;

  @ApiProperty({ description: 'Current TSB' })
  current_tsb: number;

  @ApiProperty({ description: 'Target TSB for race day' })
  target_tsb: number;

  @ApiProperty({ description: 'Projected TSB on race day' })
  projected_race_day_tsb: number;

  @ApiProperty({ type: TaperAssessmentDTO })
  race_day_assessment: TaperAssessmentDTO;

  @ApiProperty({ type: [TaperDayDTO] })
  daily_plan: TaperDayDTO[];

  @ApiProperty({ type: [String] })
  recommendations: string[];
}

export class AthleteProfileMetricsDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  user_id: string;

  @ApiPropertyOptional({ description: 'Birth date' })
  birth_date?: string;

  @ApiPropertyOptional({ enum: ['male', 'female', 'other'] })
  gender?: string;

  @ApiPropertyOptional({ description: 'Weight in kg' })
  weight_kg?: number;

  @ApiPropertyOptional({ description: 'Height in cm' })
  height_cm?: number;

  @ApiPropertyOptional({ description: 'Current VDOT score' })
  current_vdot?: number;

  @ApiPropertyOptional({ enum: ['calculated', 'race_result', 'manual'] })
  vdot_source?: string;

  @ApiPropertyOptional({ description: 'When VDOT was last calculated' })
  vdot_calculated_at?: string;

  @ApiPropertyOptional({ description: 'Years of training experience' })
  years_training?: number;

  @ApiPropertyOptional({ description: 'Average weekly volume in hours' })
  weekly_volume_hours?: number;

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  updated_at: string;
}

export class HistoricalRaceResultDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  user_id: string;

  @ApiPropertyOptional()
  athlete_race_id?: string;

  @ApiProperty()
  race_name: string;

  @ApiProperty()
  race_date: string;

  @ApiProperty({ enum: ['run', 'bike', 'swim', 'triathlon'] })
  sport: string;

  @ApiProperty()
  distance_meters: number;

  @ApiProperty()
  finish_time_seconds: number;

  @ApiProperty()
  finish_time_formatted: string;

  @ApiProperty()
  official_result: boolean;

  @ApiPropertyOptional()
  temperature_celsius?: number;

  @ApiPropertyOptional()
  humidity_percent?: number;

  @ApiPropertyOptional()
  course_elevation_meters?: number;

  @ApiPropertyOptional({ description: 'What we predicted (if available)' })
  predicted_time_seconds?: number;

  @ApiPropertyOptional({ description: 'Prediction error in seconds' })
  prediction_error_seconds?: number;

  @ApiPropertyOptional({ description: 'Prediction error as percentage' })
  prediction_error_percent?: number;

  @ApiProperty({ enum: ['strava', 'garmin', 'manual'] })
  source: string;

  @ApiProperty()
  created_at: string;
}

export class PredictionAccuracyStatsDTO {
  @ApiProperty({ description: 'Total races with predictions' })
  total_with_predictions: number;

  @ApiProperty({ description: 'Average prediction error percentage' })
  average_error_percent: number;

  @ApiProperty({ description: 'Average prediction error in seconds' })
  average_error_seconds: number;
}

// ==========================================================================
// Course-Based Prediction DTOs
// ==========================================================================

export class CourseSegmentDTO {
  @ApiProperty({ description: 'Segment number (1-indexed)' })
  segment_number: number;

  @ApiProperty({ description: 'Start distance in meters' })
  start_distance_meters: number;

  @ApiProperty({ description: 'End distance in meters' })
  end_distance_meters: number;

  @ApiProperty({ description: 'Average grade percentage for this segment' })
  average_grade_percent: number;

  @ApiProperty({ description: 'Elevation gain in this segment (meters)' })
  elevation_gain: number;

  @ApiProperty({ description: 'Elevation loss in this segment (meters)' })
  elevation_loss: number;

  @ApiProperty({ description: 'Adjusted pace in seconds per km' })
  adjusted_pace_seconds_per_km: number;

  @ApiProperty({ description: 'Adjusted pace formatted (MM:SS)' })
  adjusted_pace_formatted: string;

  @ApiProperty({ description: 'Time for this segment in seconds' })
  segment_time_seconds: number;

  @ApiProperty({ description: 'Cumulative time at end of segment in seconds' })
  cumulative_time_seconds: number;

  @ApiProperty({ description: 'Cumulative time formatted (HH:MM:SS or MM:SS)' })
  cumulative_time_formatted: string;
}

export class ElevationProfilePointDTO {
  @ApiProperty({ description: 'Distance from start in meters' })
  distance: number;

  @ApiProperty({ description: 'Elevation in meters' })
  elevation: number;

  @ApiProperty({ description: 'Pace at this point in seconds per km' })
  pace: number;
}

export class CourseSummaryDTO {
  @ApiProperty({ description: 'Total elevation gain in meters' })
  total_elevation_gain: number;

  @ApiProperty({ description: 'Total elevation loss in meters' })
  total_elevation_loss: number;

  @ApiProperty({ description: 'Steepest climb percentage' })
  steepest_climb_percent: number;

  @ApiProperty({ description: 'Steepest descent percentage' })
  steepest_descent_percent: number;

  @ApiProperty({ description: 'Average grade percentage' })
  average_grade_percent: number;
}

export class CourseBasedPredictionDTO {
  @ApiProperty({ description: 'Predicted finish time in seconds' })
  predicted_time_seconds: number;

  @ApiProperty({ description: 'Predicted time formatted (HH:MM:SS)' })
  predicted_time_formatted: string;

  @ApiProperty({ description: 'Equivalent flat terrain time in seconds' })
  flat_equivalent_time_seconds: number;

  @ApiProperty({ description: 'Flat equivalent time formatted' })
  flat_equivalent_time_formatted: string;

  @ApiProperty({ description: 'Time adjustment due to elevation (seconds)' })
  elevation_adjustment_seconds: number;

  @ApiProperty({ description: 'Course distance in meters' })
  distance_meters: number;

  @ApiProperty({ description: 'Confidence score (0-1)' })
  confidence_score: number;

  @ApiProperty({ type: [CourseSegmentDTO], description: 'Per-segment split predictions' })
  segments: CourseSegmentDTO[];

  @ApiProperty({
    type: [ElevationProfilePointDTO],
    description: 'Elevation profile with pace overlay',
  })
  elevation_profile: ElevationProfilePointDTO[];

  @ApiProperty({ type: CourseSummaryDTO, description: 'Course elevation summary' })
  summary: CourseSummaryDTO;

  @ApiProperty({ type: [String], description: 'Algorithms used for prediction' })
  algorithms_used: string[];

  @ApiPropertyOptional({ type: [String], description: 'Any warnings about the course data' })
  warnings?: string[];
}

// ==========================================================================
// Race Plan DTOs
// ==========================================================================

export class EffortZoneDTO {
  @ApiProperty({ description: 'Segment number' })
  segment_number: number;

  @ApiProperty({ description: 'Zone name (e.g., Warmup, Race Pace, Tempo, Threshold)' })
  zone_name: string;

  @ApiPropertyOptional({ description: 'Target heart rate minimum (bpm)' })
  target_hr_min?: number;

  @ApiPropertyOptional({ description: 'Target heart rate maximum (bpm)' })
  target_hr_max?: number;

  @ApiProperty({ description: 'Target pace minimum (seconds per km)' })
  target_pace_min_seconds_per_km: number;

  @ApiProperty({ description: 'Target pace maximum (seconds per km)' })
  target_pace_max_seconds_per_km: number;

  @ApiProperty({ description: 'RPE scale (1-10)' })
  rpe_scale: number;

  @ApiProperty({ description: 'Description of effort for this zone' })
  description: string;
}

export class NutritionTimingDTO {
  @ApiProperty({ description: 'Time elapsed in minutes' })
  time_elapsed_minutes: number;

  @ApiProperty({ description: 'Distance covered in km' })
  distance_km: number;

  @ApiProperty({ description: 'Carbohydrates to consume (grams)' })
  carbs_grams: number;

  @ApiProperty({ description: 'Hydration to consume (ml)' })
  hydration_ml: number;

  @ApiPropertyOptional({ description: 'Notes for this nutrition point' })
  notes?: string;
}

export class CaffeineStrategyDTO {
  @ApiProperty({ description: 'Pre-race caffeine dose (mg)' })
  pre_race_mg: number;

  @ApiProperty({ description: 'Timing before race start (minutes)' })
  pre_race_timing_minutes: number;

  @ApiPropertyOptional({ description: 'On-course caffeine dose (mg)' })
  on_course_mg?: number;

  @ApiPropertyOptional({ description: 'Timing after race start (minutes)' })
  on_course_timing_minutes?: number;
}

export class EnergyManagementPlanDTO {
  @ApiProperty({ description: 'Days before race to start carb loading' })
  carb_loading_days_before: number;

  @ApiProperty({ description: 'Race morning carbohydrate intake (grams)' })
  race_morning_carbs_grams: number;

  @ApiProperty({ description: 'Hours before race to eat breakfast' })
  race_morning_timing_hours_before: number;

  @ApiProperty({ type: [NutritionTimingDTO], description: 'On-course nutrition timeline' })
  on_course_nutrition: NutritionTimingDTO[];

  @ApiProperty({ description: 'Total carbs per hour target' })
  total_carbs_per_hour: number;

  @ApiProperty({ description: 'Total hydration per hour target (ml)' })
  total_hydration_ml_per_hour: number;

  @ApiPropertyOptional({ type: CaffeineStrategyDTO, description: 'Caffeine strategy if applicable' })
  caffeine_strategy?: CaffeineStrategyDTO;
}

export class MentalCheckpointDTO {
  @ApiProperty({ description: 'Distance in km' })
  distance_km: number;

  @ApiProperty({ description: 'Percentage of race complete' })
  percentage_complete: number;

  @ApiProperty({ description: 'Message for this checkpoint' })
  message: string;

  @ApiProperty({ description: 'Advice for this checkpoint' })
  advice: string;
}

export class FatigueModelDTO {
  @ApiProperty({ description: 'Baseline fade factor (e.g., 1.03 = 3% expected slowdown)' })
  baseline_fade_factor: number;

  @ApiProperty({ description: 'Critical fatigue point distance (km)' })
  critical_fatigue_point_km: number;

  @ApiProperty({ type: [MentalCheckpointDTO], description: 'Mental checkpoints throughout race' })
  mental_checkpoints: MentalCheckpointDTO[];

  @ApiProperty({ description: 'Overall pacing guidance' })
  pacing_guidance: string;
}

export class WeatherAdjustmentsDTO {
  @ApiProperty({ description: 'Time impact from temperature (seconds)' })
  temperature_impact_seconds: number;

  @ApiProperty({ description: 'Time impact from humidity (seconds)' })
  humidity_impact_seconds: number;

  @ApiProperty({ description: 'Time impact from wind (seconds)' })
  wind_impact_seconds: number;

  @ApiProperty({ description: 'Total time impact (seconds)' })
  total_impact_seconds: number;

  @ApiProperty({ description: 'Total impact as percentage' })
  total_impact_percent: number;

  @ApiProperty({ enum: ['none', 'low', 'moderate', 'high', 'extreme'], description: 'Heat stress level' })
  heat_stress_level: string;

  @ApiProperty({ description: 'Hydration needs multiplier' })
  hydration_multiplier: number;

  @ApiProperty({ description: 'Pacing advice based on weather' })
  pacing_advice: string;

  @ApiPropertyOptional({ type: [String], description: 'Risk warnings' })
  risk_warnings?: string[];
}

export class WeatherSummaryDTO {
  @ApiProperty({ description: 'Temperature in Celsius' })
  temperature_celsius: number;

  @ApiProperty({ description: 'Humidity percentage' })
  humidity_percent: number;

  @ApiProperty({ description: 'Wind speed in km/h' })
  wind_speed_kmh: number;

  @ApiProperty({ description: 'Weather conditions description' })
  conditions: string;

  @ApiPropertyOptional({ type: WeatherAdjustmentsDTO, description: 'Performance adjustments' })
  adjustments?: WeatherAdjustmentsDTO;
}

export class RacePlanDTO {
  @ApiProperty({ description: 'Race plan ID' })
  id: string;

  @ApiProperty({ description: 'Athlete race ID' })
  athlete_race_id: string;

  @ApiPropertyOptional({ description: 'Associated prediction ID' })
  race_prediction_id?: string;

  @ApiProperty({ description: 'Predicted finish time in seconds' })
  predicted_finish_time_seconds: number;

  @ApiPropertyOptional({ description: 'Target finish time in seconds' })
  target_finish_time_seconds?: number;

  @ApiProperty({ enum: ['even', 'negative_split', 'conservative', 'progressive'], description: 'Pacing strategy' })
  pacing_strategy: string;

  @ApiPropertyOptional({ description: 'Negative split ratio if applicable' })
  negative_split_ratio?: number;

  @ApiProperty({ type: [CourseSegmentDTO], description: 'Segment-by-segment splits' })
  segment_splits: CourseSegmentDTO[];

  @ApiProperty({ type: [EffortZoneDTO], description: 'Effort zones for each segment' })
  effort_zones: EffortZoneDTO[];

  @ApiProperty({ type: EnergyManagementPlanDTO, description: 'Nutrition and hydration plan' })
  energy_management: EnergyManagementPlanDTO;

  @ApiProperty({ type: FatigueModelDTO, description: 'Fatigue model and mental checkpoints' })
  fatigue_model: FatigueModelDTO;

  @ApiPropertyOptional({ type: WeatherSummaryDTO, description: 'Weather forecast and impacts' })
  weather?: WeatherSummaryDTO;

  @ApiProperty({ description: 'Warmup protocol' })
  warmup_protocol: string;

  @ApiProperty({ type: [String], description: 'Race day checklist' })
  race_day_checklist: string[];

  @ApiProperty({ type: [String], description: 'Key advice for race day' })
  key_advice: string[];

  @ApiProperty({ enum: ['active', 'superseded', 'archived'], description: 'Plan status' })
  status: string;

  @ApiProperty({ description: 'Plan version number' })
  plan_version: number;

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  updated_at: string;
}
