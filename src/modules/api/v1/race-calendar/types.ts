export type EventType = 'run' | 'cycle' | 'triathlon' | 'swim';
export type EventSource = 'active' | 'runsignup' | 'manual';
export type RacePriority = 'A' | 'B' | 'C';
export type PeriodizationStatus = 'suggested' | 'accepted' | 'custom';
export type PeriodizationCreator = 'system' | 'coach' | 'athlete';
export type AthleteLevel = 'beginner' | 'intermediate' | 'advanced';

export interface PeriodizationPhase {
  name: string;
  start_date: string;
  end_date: string;
  weeks: number;
  focus: string;
  description: string | null;
  volume_percentage: number;
  intensity_percentage: number;
}

export interface CourseMetrics {
  total_distance_meters: number;
  elevation_gain_meters: number;
  elevation_loss_meters: number;
  max_elevation_meters: number;
  min_elevation_meters: number;
  steepest_grade_percent: number | null;
  num_points: number;
}
