import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { CourseMetrics, PeriodizationPhase } from './types';

// =============================================================================
// Course Prediction DTOs
// =============================================================================

export class CourseMetricsDTO {
  @ApiProperty({ description: 'Total course distance in meters' })
  total_distance_meters: number;

  @ApiProperty({ description: 'Total elevation gain in meters' })
  elevation_gain_meters: number;

  @ApiProperty({ description: 'Total elevation loss in meters' })
  elevation_loss_meters: number;

  @ApiProperty({ description: 'Maximum elevation in meters' })
  max_elevation_meters: number;

  @ApiProperty({ description: 'Minimum elevation in meters' })
  min_elevation_meters: number;

  @ApiPropertyOptional({ description: 'Steepest grade as a percentage' })
  steepest_grade_percent: number | null;

  @ApiProperty({ description: 'Number of GPS points in the course' })
  num_points: number;
}

export class CourseSegmentPredictionDTO {
  @ApiProperty()
  segment_number: number;

  @ApiProperty()
  start_distance_meters: number;

  @ApiProperty()
  end_distance_meters: number;

  @ApiProperty()
  average_grade_percent: number;

  @ApiProperty()
  elevation_gain: number;

  @ApiProperty()
  elevation_loss: number;

  @ApiProperty()
  adjusted_pace_seconds_per_km: number;

  @ApiProperty()
  segment_time_seconds: number;

  @ApiProperty()
  cumulative_time_seconds: number;
}

export class ElevationProfilePointDTO {
  @ApiProperty()
  distance: number;

  @ApiProperty()
  elevation: number;

  @ApiProperty()
  pace: number;
}

export class CoursePredictionSummaryDTO {
  @ApiProperty({ description: 'Predicted finish time in seconds' })
  predicted_time_seconds: number;

  @ApiProperty({ description: 'Formatted predicted time (HH:MM:SS)' })
  predicted_time_formatted: string;

  @ApiProperty({ description: 'Confidence score (0-1)' })
  confidence_score: number;

  @ApiProperty({ description: 'Total elevation gain' })
  total_elevation_gain: number;

  @ApiProperty({ description: 'Total elevation loss' })
  total_elevation_loss: number;
}

export class CourseBasedPredictionDTO {
  @ApiProperty({ description: 'Predicted finish time in seconds' })
  predicted_time_seconds: number;

  @ApiProperty({ description: 'Formatted predicted time' })
  predicted_time_formatted: string;

  @ApiProperty({ description: 'What the time would be on a flat course' })
  flat_equivalent_time_seconds: number;

  @ApiProperty({ description: 'Confidence score (0-1)' })
  confidence_score: number;

  @ApiProperty({ type: [CourseSegmentPredictionDTO] })
  segments: CourseSegmentPredictionDTO[];

  @ApiProperty({ type: [ElevationProfilePointDTO] })
  elevation_profile: ElevationProfilePointDTO[];

  @ApiProperty()
  summary: {
    total_elevation_gain: number;
    total_elevation_loss: number;
    steepest_climb_percent: number;
    steepest_descent_percent: number;
    average_grade_percent: number;
  };
}

// =============================================================================
// Race Prediction Summary
// =============================================================================

export class RacePredictionSummaryDTO {
  @ApiProperty({ description: 'Predicted time in seconds' })
  predicted_time_seconds: number;

  @ApiProperty({ description: 'Formatted predicted time (HH:MM:SS)' })
  predicted_time_formatted: string;

  @ApiProperty({ description: 'Confidence score (0-1)' })
  confidence_score: number;

  @ApiPropertyOptional({ description: 'Target pace in seconds per km' })
  target_pace_per_km?: number;

  @ApiPropertyOptional({ enum: ['very_likely', 'likely', 'possible', 'unlikely'] })
  goal_achievability?: string;
}

export class RaceEventDTO {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  external_id: string | null;

  @ApiProperty({ enum: ['active', 'runsignup', 'worldtriathlon', 'opentrack', 'manual'] })
  source: 'active' | 'runsignup' | 'worldtriathlon' | 'opentrack' | 'manual';

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty({ enum: ['run', 'cycle', 'triathlon', 'swim'] })
  event_type: 'run' | 'cycle' | 'triathlon' | 'swim';

  @ApiProperty()
  date: string;

  @ApiPropertyOptional()
  location_city: string | null;

  @ApiPropertyOptional()
  location_country: string | null;

  @ApiPropertyOptional()
  latitude: number | null;

  @ApiPropertyOptional()
  longitude: number | null;

  @ApiPropertyOptional()
  distance_meters: number | null;

  @ApiPropertyOptional()
  elevation_gain_meters: number | null;

  @ApiPropertyOptional()
  url: string | null;

  @ApiProperty()
  cached_at: string;
}

export class AthleteRaceDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  user_id: string;

  @ApiPropertyOptional()
  race_event_id: string | null;

  @ApiPropertyOptional({ type: RaceEventDTO })
  race_event: RaceEventDTO | null;

  @ApiPropertyOptional()
  manual_name: string | null;

  @ApiPropertyOptional()
  manual_date: string | null;

  @ApiPropertyOptional({ enum: ['run', 'cycle', 'triathlon', 'swim'] })
  manual_event_type: 'run' | 'cycle' | 'triathlon' | 'swim' | null;

  @ApiPropertyOptional()
  manual_distance_meters: number | null;

  @ApiPropertyOptional()
  goal_time_seconds: number | null;

  @ApiPropertyOptional({ enum: ['A', 'B', 'C'] })
  priority: 'A' | 'B' | 'C' | null;

  @ApiPropertyOptional()
  course_file_path: string | null;

  @ApiPropertyOptional({ type: CourseMetricsDTO, description: 'Course metrics if course file uploaded' })
  course_metrics?: CourseMetricsDTO;

  @ApiPropertyOptional({ type: CoursePredictionSummaryDTO, description: 'Course-based prediction summary' })
  course_prediction?: CoursePredictionSummaryDTO;

  @ApiPropertyOptional()
  notes: string | null;

  @ApiPropertyOptional({ type: RacePredictionSummaryDTO, description: 'Current prediction for this race' })
  prediction?: RacePredictionSummaryDTO;

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  updated_at: string;
}

export class PeriodizationPlanDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  athlete_race_id: string;

  @ApiProperty({ enum: ['suggested', 'accepted', 'custom'] })
  status: 'suggested' | 'accepted' | 'custom';

  @ApiProperty({ type: 'array' })
  phases: PeriodizationPhase[];

  @ApiProperty({ enum: ['system', 'coach', 'athlete'] })
  created_by: 'system' | 'coach' | 'athlete';

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  modified_at: string;
}

export class CourseUploadResponseDTO {
  @ApiProperty()
  file_path: string;

  @ApiProperty({ enum: ['gpx', 'fit'] })
  file_type: 'gpx' | 'fit';

  @ApiProperty({ type: CourseMetricsDTO })
  metrics: CourseMetricsDTO;

  @ApiPropertyOptional({ type: CourseBasedPredictionDTO, description: 'Course-based prediction if generated' })
  prediction?: CourseBasedPredictionDTO;
}
