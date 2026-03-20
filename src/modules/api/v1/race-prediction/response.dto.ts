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
