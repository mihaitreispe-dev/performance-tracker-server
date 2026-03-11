import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CardioMetricType, WorkoutType } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

// Weekly Summary

export class WorkoutTypeBreakdownDTO {
  @ApiProperty({ enum: WorkoutType })
  @IsEnumString(WorkoutType)
  type: WorkoutType;

  @ApiProperty()
  @IsNumber()
  count: number;
}

export class WeeklySummaryDTO {
  @ApiProperty({ description: 'Start of the week (Monday)' })
  @IsString()
  weekStart: string;

  @ApiProperty({ description: 'End of the week (Sunday)' })
  @IsString()
  weekEnd: string;

  @ApiProperty({ description: 'Total workouts scheduled for the week' })
  @IsNumber()
  totalScheduled: number;

  @ApiProperty({ description: 'Number of completed workouts' })
  @IsNumber()
  totalCompleted: number;

  @ApiProperty({ description: 'Completion percentage (0-100)' })
  @IsNumber()
  completionPercentage: number;

  @ApiProperty({ description: 'Total duration in seconds of completed workouts' })
  @IsNumber()
  totalDurationSeconds: number;

  @ApiProperty({ type: [WorkoutTypeBreakdownDTO], description: 'Breakdown by workout type' })
  @IsArray()
  @ValidateNested({ each: true })
  typeBreakdown: WorkoutTypeBreakdownDTO[];
}

export class WeeklySummaryResponse extends ItemResponse<WeeklySummaryDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WeeklySummaryDTO;
}

// Workout Analytics

export class MetricSummaryDTO {
  @ApiProperty({ enum: CardioMetricType })
  @IsEnumString(CardioMetricType)
  metricType: CardioMetricType;

  @ApiProperty()
  @IsNumber()
  min: number;

  @ApiProperty()
  @IsNumber()
  max: number;

  @ApiProperty()
  @IsNumber()
  avg: number;

  @ApiProperty()
  @IsString()
  unit: string;
}

export class SetSummaryDTO {
  @ApiProperty()
  @IsUUID()
  exerciseInstanceId: string;

  @ApiProperty()
  @IsString()
  exerciseName: string;

  @ApiProperty()
  @IsNumber()
  totalSets: number;

  @ApiProperty()
  @IsNumber()
  completedSets: number;

  @ApiProperty()
  @IsNumber()
  skippedSets: number;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  avgRpe?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  totalReps?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  maxLoad?: number | null;
}

export class SplitDTO {
  @ApiProperty()
  @IsNumber()
  splitNumber: number;

  @ApiProperty()
  @IsNumber()
  splitTimeSeconds: number;

  @ApiProperty()
  @IsNumber()
  cumulativeTimeSeconds: number;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  avgHeartRate?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  avgPaceSecondsPerKm?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  elevationMeters?: number | null;
}

export class ExecutionWeatherDTO {
  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  temperatureCelsius?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  feelsLikeCelsius?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  humidityPercent?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  windSpeedKmh?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  windDirectionDegrees?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  windGustsKmh?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  precipitationMm?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  weatherCode?: number | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  weatherDescription?: string | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  cloudCoverPercent?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  pressureHpa?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  visibilityMeters?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  uvIndex?: number | null;

  @ApiProperty()
  @IsString()
  recordedAt: string;
}

export class RouteAnalyticsDTO {
  @ApiProperty()
  @IsNumber()
  totalDistanceMeters: number;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  elevationGainMeters?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  elevationLossMeters?: number | null;

  @ApiProperty({ type: [SplitDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  splits: SplitDTO[];

  @ApiProperty({ description: 'GeoJSON LineString for the route' })
  @IsObject()
  routeGeojson: any;
}

export class WorkoutAnalyticsDTO {
  @ApiProperty()
  @IsUUID()
  executionId: string;

  @ApiProperty()
  @IsString()
  workoutName: string;

  @ApiProperty({ enum: WorkoutType })
  @IsEnumString(WorkoutType)
  workoutType: WorkoutType;

  @ApiProperty()
  @IsString()
  startedAt: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  completedAt?: string | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  durationSeconds?: number | null;

  @ApiProperty({ type: [MetricSummaryDTO], description: 'Summary of cardio metrics' })
  @IsArray()
  @ValidateNested({ each: true })
  metricsSummary: MetricSummaryDTO[];

  @ApiProperty({ type: [SetSummaryDTO], description: 'Summary of set completions' })
  @IsArray()
  @ValidateNested({ each: true })
  setsSummary: SetSummaryDTO[];

  @ApiPropertyOptional({ type: RouteAnalyticsDTO, description: 'Route analytics if available' })
  @IsObject()
  @ValidateNested()
  @IsOptional()
  route?: RouteAnalyticsDTO | null;

  @ApiPropertyOptional({ type: ExecutionWeatherDTO, description: 'Weather conditions at workout start' })
  @IsObject()
  @ValidateNested()
  @IsOptional()
  weather?: ExecutionWeatherDTO | null;
}

export class WorkoutAnalyticsResponse extends ItemResponse<WorkoutAnalyticsDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WorkoutAnalyticsDTO;
}

// Period Summary

export class DailyWorkoutDTO {
  @ApiProperty({ enum: WorkoutType })
  @IsEnumString(WorkoutType)
  workoutType: WorkoutType;

  @ApiProperty()
  @IsNumber()
  durationSeconds: number;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  distanceMeters?: number | null;
}

export class DailyActivityDTO {
  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  date: string;

  @ApiProperty({ type: [DailyWorkoutDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyWorkoutDTO)
  workouts: DailyWorkoutDTO[];
}

export class HRZoneStatDTO {
  @ApiProperty()
  @IsNumber()
  zone: number;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsNumber()
  minBpm: number;

  @ApiProperty()
  @IsNumber()
  maxBpm: number;

  @ApiProperty()
  @IsNumber()
  timeSeconds: number;

  @ApiProperty()
  @IsNumber()
  percentage: number;
}

export class HRZonesSummaryDTO {
  @ApiProperty()
  @IsBoolean()
  configured: boolean;

  @ApiPropertyOptional({ type: [HRZoneStatDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HRZoneStatDTO)
  @IsOptional()
  zones?: HRZoneStatDTO[];
}

export class MuscleGroupVolumeDTO {
  @ApiProperty()
  @IsString()
  muscleGroupId: string;

  @ApiProperty()
  @IsString()
  muscleGroupName: string;

  @ApiProperty({ description: 'Whether this is a primary muscle group for the exercises' })
  @IsBoolean()
  isPrimary: boolean;

  @ApiProperty({ description: 'Total number of sets targeting this muscle group' })
  @IsNumber()
  totalSets: number;

  @ApiProperty({ description: 'Total number of reps targeting this muscle group' })
  @IsNumber()
  totalReps: number;

  @ApiProperty({ description: 'Total volume (sets * reps * load) for this muscle group' })
  @IsNumber()
  totalVolume: number;

  @ApiProperty({ description: 'Percentage of total volume' })
  @IsNumber()
  volumePercentage: number;
}

export class MuscleGroupBreakdownDTO {
  @ApiProperty({ type: [MuscleGroupVolumeDTO], description: 'Volume breakdown by muscle group' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MuscleGroupVolumeDTO)
  muscleGroups: MuscleGroupVolumeDTO[];

  @ApiProperty({ description: 'Total volume across all muscle groups' })
  @IsNumber()
  totalVolume: number;

  @ApiProperty({ description: 'Total sets across all exercises' })
  @IsNumber()
  totalSets: number;

  @ApiProperty({ description: 'Total reps across all exercises' })
  @IsNumber()
  totalReps: number;
}

export class PeriodSummaryDTO {
  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  periodStart: string;

  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  periodEnd: string;

  @ApiProperty()
  @IsNumber()
  totalDistanceMeters: number;

  @ApiProperty()
  @IsNumber()
  workoutCount: number;

  @ApiProperty()
  @IsNumber()
  totalDurationSeconds: number;

  @ApiProperty({ type: [DailyActivityDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyActivityDTO)
  dailyBreakdown: DailyActivityDTO[];

  @ApiPropertyOptional({ type: HRZonesSummaryDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => HRZonesSummaryDTO)
  @IsOptional()
  hrZonesSummary?: HRZonesSummaryDTO | null;

  @ApiPropertyOptional({ type: MuscleGroupBreakdownDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => MuscleGroupBreakdownDTO)
  @IsOptional()
  muscleGroupBreakdown?: MuscleGroupBreakdownDTO | null;
}

export class PeriodSummaryResponse extends ItemResponse<PeriodSummaryDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: PeriodSummaryDTO;
}

// Training Load

export class TrainingLoadDTO {
  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  date: string;

  @ApiProperty({ description: 'Daily training load (TRIMP-like score)' })
  @IsNumber()
  dailyLoad: number;

  @ApiProperty({ description: 'Acute load (7-day rolling average)' })
  @IsNumber()
  acuteLoad: number;

  @ApiProperty({ description: 'Chronic load (28-day rolling average)' })
  @IsNumber()
  chronicLoad: number;

  @ApiPropertyOptional({ type: Number, description: 'Acute:Chronic Workload Ratio' })
  @IsNumber()
  @IsOptional()
  acwr?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Fatigue score (0-100)' })
  @IsNumber()
  @IsOptional()
  fatigueScore?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Fitness score (chronic training load)' })
  @IsNumber()
  @IsOptional()
  fitnessScore?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Form score (fitness - fatigue)' })
  @IsNumber()
  @IsOptional()
  formScore?: number | null;

  @ApiProperty({ description: 'Load contribution from HR zones' })
  @IsNumber()
  hrLoadContribution: number;

  @ApiProperty({ description: 'Load contribution from duration' })
  @IsNumber()
  durationLoadContribution: number;

  @ApiProperty({ description: 'Load contribution from strength volume' })
  @IsNumber()
  volumeLoadContribution: number;

  @ApiProperty({ description: 'Number of workouts on this day' })
  @IsNumber()
  workoutCount: number;
}

export class CurrentTrainingLoadDTO {
  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  date: string;

  @ApiProperty({ description: 'Current acute load (7-day)' })
  @IsNumber()
  acuteLoad: number;

  @ApiProperty({ description: 'Current chronic load (28-day)' })
  @IsNumber()
  chronicLoad: number;

  @ApiPropertyOptional({ type: Number, description: 'Acute:Chronic Workload Ratio' })
  @IsNumber()
  @IsOptional()
  acwr?: number | null;

  @ApiProperty({ description: 'ACWR status: optimal, caution, high_risk, low' })
  @IsString()
  acwrStatus: 'optimal' | 'caution' | 'high_risk' | 'low' | 'no_data';

  @ApiPropertyOptional({ type: Number, description: 'Fatigue score (acute load weighted)' })
  @IsNumber()
  @IsOptional()
  fatigueScore?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Fitness score (chronic load weighted)' })
  @IsNumber()
  @IsOptional()
  fitnessScore?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Form score (fitness - fatigue, higher is better)' })
  @IsNumber()
  @IsOptional()
  formScore?: number | null;

  @ApiProperty({ description: 'Form status: fresh, neutral, fatigued' })
  @IsString()
  formStatus: 'fresh' | 'neutral' | 'fatigued' | 'no_data';

  @ApiProperty({ description: 'Total workouts in last 7 days' })
  @IsNumber()
  workoutsLast7Days: number;

  @ApiProperty({ description: 'Total workouts in last 28 days' })
  @IsNumber()
  workoutsLast28Days: number;
}

export class CurrentTrainingLoadResponse extends ItemResponse<CurrentTrainingLoadDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: CurrentTrainingLoadDTO;
}

export class TrainingLoadHistoryDTO {
  @ApiProperty({ type: [TrainingLoadDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrainingLoadDTO)
  history: TrainingLoadDTO[];
}

export class TrainingLoadHistoryResponse extends ItemResponse<TrainingLoadHistoryDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: TrainingLoadHistoryDTO;
}

// Streak

export class StreakDayDTO {
  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  date: string;

  @ApiProperty({ description: 'Day of week (1=Mon, 7=Sun)' })
  @IsNumber()
  dayOfWeek: number;

  @ApiProperty({ description: 'Whether a workout was completed on this day' })
  @IsBoolean()
  hasWorkout: boolean;

  @ApiPropertyOptional({ enum: WorkoutType, description: 'Type of workout if completed' })
  @IsEnumString(WorkoutType)
  @IsOptional()
  workoutType?: WorkoutType | null;

  @ApiProperty({ description: 'Whether this day is in the past' })
  @IsBoolean()
  isPast: boolean;

  @ApiProperty({ description: 'Whether this day is today' })
  @IsBoolean()
  isToday: boolean;
}

export class StreakWeekDTO {
  @ApiProperty({ description: 'Week number (0 = current week, 1 = last week, etc.)' })
  @IsNumber()
  weekNumber: number;

  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  weekStart: string;

  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  weekEnd: string;

  @ApiProperty({ description: 'Number of workouts completed this week' })
  @IsNumber()
  workoutCount: number;

  @ApiProperty({ description: 'Whether this week counts toward the streak (3+ workouts)' })
  @IsBoolean()
  countsTowardStreak: boolean;

  @ApiProperty({ type: [StreakDayDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StreakDayDTO)
  days: StreakDayDTO[];
}

export class StreakDTO {
  @ApiProperty({ description: 'Current streak in weeks' })
  @IsNumber()
  currentStreakWeeks: number;

  @ApiProperty({ description: 'Longest streak ever in weeks' })
  @IsNumber()
  longestStreakWeeks: number;

  @ApiProperty({ description: 'Total workouts completed all time' })
  @IsNumber()
  totalWorkouts: number;

  @ApiProperty({ description: 'Whether current week is on track (3+ workouts or potential to reach 3)' })
  @IsBoolean()
  currentWeekOnTrack: boolean;

  @ApiProperty({ description: 'Workouts needed this week to maintain streak' })
  @IsNumber()
  workoutsNeededThisWeek: number;

  @ApiProperty({ type: [StreakWeekDTO], description: 'Last 4 weeks breakdown' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StreakWeekDTO)
  weeks: StreakWeekDTO[];
}

export class StreakResponse extends ItemResponse<StreakDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: StreakDTO;
}

// Race Predictions

export const RacePredictionSport = {
  RUNNING: 'running',
  CYCLING: 'cycling',
  SWIMMING: 'swimming',
  TRIATHLON: 'triathlon',
} as const;
export type RacePredictionSport = (typeof RacePredictionSport)[keyof typeof RacePredictionSport];

export class RacePredictionDTO {
  @ApiProperty({ description: 'Race distance identifier' })
  @IsString()
  raceId: string;

  @ApiProperty({ description: 'Race name (e.g., "5K", "Half Marathon")' })
  @IsString()
  raceName: string;

  @ApiProperty({ description: 'Race distance in meters' })
  @IsNumber()
  distanceMeters: number;

  @ApiProperty({ description: 'Predicted time in seconds' })
  @IsNumber()
  predictedTimeSeconds: number;

  @ApiProperty({ description: 'Predicted time formatted (HH:MM:SS or MM:SS)' })
  @IsString()
  predictedTimeFormatted: string;

  @ApiProperty({ description: 'Predicted pace in seconds per kilometer' })
  @IsNumber()
  paceSecondsPerKm: number;

  @ApiProperty({ description: 'Predicted pace formatted (MM:SS /km)' })
  @IsString()
  paceFormatted: string;

  @ApiPropertyOptional({ type: Number, description: 'Confidence level 0-100 based on data quality' })
  @IsNumber()
  @IsOptional()
  confidence?: number | null;
}

export class RaceDataSourceDTO {
  @ApiProperty({ description: 'Source type: personal_record or recent_run' })
  @IsString()
  sourceType: 'personal_record' | 'recent_run';

  @ApiProperty({ description: 'Distance used for prediction (meters)' })
  @IsNumber()
  distanceMeters: number;

  @ApiProperty({ description: 'Time achieved at this distance (seconds)' })
  @IsNumber()
  timeSeconds: number;

  @ApiProperty({ description: 'Date when this was achieved' })
  @IsString()
  achievedAt: string;

  @ApiPropertyOptional({ type: String, description: 'Description of the source' })
  @IsString()
  @IsOptional()
  description?: string | null;
}

export class RacePredictionsDTO {
  @ApiProperty({ type: [RacePredictionDTO], description: 'Predicted times for various race distances' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RacePredictionDTO)
  predictions: RacePredictionDTO[];

  @ApiProperty({ type: RaceDataSourceDTO, description: 'Data source used for predictions' })
  @IsObject()
  @ValidateNested()
  @Type(() => RaceDataSourceDTO)
  dataSource: RaceDataSourceDTO;

  @ApiProperty({ description: 'Whether sufficient data exists for predictions' })
  @IsBoolean()
  hasData: boolean;

  @ApiPropertyOptional({ type: String, description: 'Message when no data available' })
  @IsString()
  @IsOptional()
  message?: string | null;
}

export class RacePredictionsResponse extends ItemResponse<RacePredictionsDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: RacePredictionsDTO;
}

// Multi-Sport Race Predictions

export class CyclingDataSourceDTO {
  @ApiProperty({ description: 'FTP (Functional Threshold Power) in watts' })
  @IsNumber()
  ftp: number;

  @ApiPropertyOptional({ type: String, description: 'Date when FTP was recorded' })
  @IsString()
  @IsOptional()
  recordedAt?: string | null;

  @ApiPropertyOptional({ type: String, description: 'Source of FTP (test, estimate, etc.)' })
  @IsString()
  @IsOptional()
  source?: string | null;
}

export class SwimmingDataSourceDTO {
  @ApiProperty({ description: 'CSS (Critical Swim Speed) in m/s' })
  @IsNumber()
  cssMetersPerSecond: number;

  @ApiProperty({ description: 'CSS pace formatted (e.g., "1:45 /100m")' })
  @IsString()
  cssPaceFormatted: string;

  @ApiPropertyOptional({ type: String, description: 'Date when CSS was recorded' })
  @IsString()
  @IsOptional()
  recordedAt?: string | null;

  @ApiPropertyOptional({ type: String, description: 'Source of CSS' })
  @IsString()
  @IsOptional()
  source?: string | null;
}

export class CyclingPredictionDTO {
  @ApiProperty({ description: 'Event identifier' })
  @IsString()
  eventId: string;

  @ApiProperty({ description: 'Event name (e.g., "10km Time Trial")' })
  @IsString()
  eventName: string;

  @ApiProperty({ description: 'Distance in meters' })
  @IsNumber()
  distanceMeters: number;

  @ApiProperty({ description: 'Predicted time in seconds' })
  @IsNumber()
  predictedTimeSeconds: number;

  @ApiProperty({ description: 'Predicted time formatted (HH:MM:SS or MM:SS)' })
  @IsString()
  predictedTimeFormatted: string;

  @ApiProperty({ description: 'Average speed in km/h' })
  @IsNumber()
  avgSpeedKmh: number;

  @ApiProperty({ description: 'Average power in watts' })
  @IsNumber()
  avgPowerWatts: number;

  @ApiPropertyOptional({ type: Number, description: 'Confidence level 0-100' })
  @IsNumber()
  @IsOptional()
  confidence?: number | null;
}

export class CyclingPredictionsDTO {
  @ApiProperty({ type: [CyclingPredictionDTO], description: 'Cycling time trial predictions' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CyclingPredictionDTO)
  predictions: CyclingPredictionDTO[];

  @ApiPropertyOptional({ type: CyclingDataSourceDTO, description: 'FTP data used for predictions' })
  @IsObject()
  @ValidateNested()
  @Type(() => CyclingDataSourceDTO)
  @IsOptional()
  dataSource?: CyclingDataSourceDTO | null;

  @ApiProperty({ description: 'Whether sufficient data exists for predictions' })
  @IsBoolean()
  hasData: boolean;

  @ApiPropertyOptional({ type: String, description: 'Message when no data available' })
  @IsString()
  @IsOptional()
  message?: string | null;
}

export class SwimmingPredictionDTO {
  @ApiProperty({ description: 'Event identifier' })
  @IsString()
  eventId: string;

  @ApiProperty({ description: 'Event name (e.g., "400m Freestyle")' })
  @IsString()
  eventName: string;

  @ApiProperty({ description: 'Distance in meters' })
  @IsNumber()
  distanceMeters: number;

  @ApiProperty({ description: 'Predicted time in seconds' })
  @IsNumber()
  predictedTimeSeconds: number;

  @ApiProperty({ description: 'Predicted time formatted (HH:MM:SS or MM:SS)' })
  @IsString()
  predictedTimeFormatted: string;

  @ApiProperty({ description: 'Pace per 100m in seconds' })
  @IsNumber()
  pacePer100mSeconds: number;

  @ApiProperty({ description: 'Pace per 100m formatted (MM:SS /100m)' })
  @IsString()
  paceFormatted: string;

  @ApiPropertyOptional({ type: Number, description: 'Confidence level 0-100' })
  @IsNumber()
  @IsOptional()
  confidence?: number | null;
}

export class SwimmingPredictionsDTO {
  @ApiProperty({ type: [SwimmingPredictionDTO], description: 'Swimming race predictions' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SwimmingPredictionDTO)
  predictions: SwimmingPredictionDTO[];

  @ApiPropertyOptional({ type: SwimmingDataSourceDTO, description: 'CSS data used for predictions' })
  @IsObject()
  @ValidateNested()
  @Type(() => SwimmingDataSourceDTO)
  @IsOptional()
  dataSource?: SwimmingDataSourceDTO | null;

  @ApiProperty({ description: 'Whether sufficient data exists for predictions' })
  @IsBoolean()
  hasData: boolean;

  @ApiPropertyOptional({ type: String, description: 'Message when no data available' })
  @IsString()
  @IsOptional()
  message?: string | null;
}

export class TriathlonLegDTO {
  @ApiProperty({ description: 'Leg identifier (swim, bike, run, t1, t2)' })
  @IsString()
  legId: string;

  @ApiProperty({ description: 'Leg name' })
  @IsString()
  legName: string;

  @ApiProperty({ description: 'Distance in meters (0 for transitions)' })
  @IsNumber()
  distanceMeters: number;

  @ApiProperty({ description: 'Predicted time in seconds' })
  @IsNumber()
  predictedTimeSeconds: number;

  @ApiProperty({ description: 'Predicted time formatted' })
  @IsString()
  predictedTimeFormatted: string;
}

export class TriathlonPredictionDTO {
  @ApiProperty({ description: 'Event identifier' })
  @IsString()
  eventId: string;

  @ApiProperty({ description: 'Event name (e.g., "Sprint Triathlon", "Ironman 70.3")' })
  @IsString()
  eventName: string;

  @ApiProperty({ type: [TriathlonLegDTO], description: 'Breakdown by leg' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TriathlonLegDTO)
  legs: TriathlonLegDTO[];

  @ApiProperty({ description: 'Total time in seconds' })
  @IsNumber()
  totalTimeSeconds: number;

  @ApiProperty({ description: 'Total time formatted (HH:MM:SS)' })
  @IsString()
  totalTimeFormatted: string;

  @ApiPropertyOptional({ type: Number, description: 'Overall confidence level 0-100' })
  @IsNumber()
  @IsOptional()
  confidence?: number | null;

  @ApiPropertyOptional({ type: [String], description: 'Sports missing data for full prediction' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  missingSports?: string[] | null;
}

export class TriathlonPredictionsDTO {
  @ApiProperty({ type: [TriathlonPredictionDTO], description: 'Triathlon event predictions' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TriathlonPredictionDTO)
  predictions: TriathlonPredictionDTO[];

  @ApiProperty({ description: 'Whether sufficient data exists for predictions' })
  @IsBoolean()
  hasData: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Sports with available data' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  availableSports?: string[] | null;

  @ApiPropertyOptional({ type: [String], description: 'Sports missing data' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  missingSports?: string[] | null;

  @ApiPropertyOptional({ type: String, description: 'Message when data is incomplete' })
  @IsString()
  @IsOptional()
  message?: string | null;
}

export class MultiSportRacePredictionsDTO {
  @ApiPropertyOptional({ type: RacePredictionsDTO, description: 'Running predictions' })
  @IsObject()
  @ValidateNested()
  @Type(() => RacePredictionsDTO)
  @IsOptional()
  running?: RacePredictionsDTO | null;

  @ApiPropertyOptional({ type: CyclingPredictionsDTO, description: 'Cycling predictions' })
  @IsObject()
  @ValidateNested()
  @Type(() => CyclingPredictionsDTO)
  @IsOptional()
  cycling?: CyclingPredictionsDTO | null;

  @ApiPropertyOptional({ type: SwimmingPredictionsDTO, description: 'Swimming predictions' })
  @IsObject()
  @ValidateNested()
  @Type(() => SwimmingPredictionsDTO)
  @IsOptional()
  swimming?: SwimmingPredictionsDTO | null;

  @ApiPropertyOptional({ type: TriathlonPredictionsDTO, description: 'Triathlon predictions' })
  @IsObject()
  @ValidateNested()
  @Type(() => TriathlonPredictionsDTO)
  @IsOptional()
  triathlon?: TriathlonPredictionsDTO | null;
}

export class MultiSportRacePredictionsResponse extends ItemResponse<MultiSportRacePredictionsDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: MultiSportRacePredictionsDTO;
}

// Strength Progression

export class StrengthDataPointDTO {
  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  date: string;

  @ApiProperty({ description: 'Max weight lifted on this date' })
  @IsNumber()
  maxWeight: number;

  @ApiProperty({ description: 'Max reps in a single set on this date' })
  @IsNumber()
  maxReps: number;

  @ApiProperty({ description: 'Best set volume (weight × reps)' })
  @IsNumber()
  bestSetVolume: number;

  @ApiProperty({ description: 'Total volume for the exercise on this date' })
  @IsNumber()
  totalVolume: number;

  @ApiProperty({ description: 'Total sets completed' })
  @IsNumber()
  totalSets: number;

  @ApiProperty({ description: 'Estimated 1RM using Brzycki formula' })
  @IsNumber()
  estimated1RM: number;

  @ApiPropertyOptional({ type: Number, description: 'Average RPE for the session' })
  @IsNumber()
  @IsOptional()
  avgRpe?: number | null;
}

export class StrengthProgressionDTO {
  @ApiProperty()
  @IsUUID()
  exerciseId: string;

  @ApiProperty()
  @IsString()
  exerciseName: string;

  @ApiProperty({ description: 'Unit for weight values' })
  @IsString()
  weightUnit: string;

  @ApiProperty({ type: [StrengthDataPointDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StrengthDataPointDTO)
  dataPoints: StrengthDataPointDTO[];

  @ApiProperty({ description: 'Total number of sessions with this exercise' })
  @IsNumber()
  totalSessions: number;

  @ApiPropertyOptional({ type: Number, description: 'Percentage improvement in max weight' })
  @IsNumber()
  @IsOptional()
  weightProgressPercent?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Percentage improvement in estimated 1RM' })
  @IsNumber()
  @IsOptional()
  e1rmProgressPercent?: number | null;
}

export class StrengthProgressionResponse extends ItemResponse<StrengthProgressionDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: StrengthProgressionDTO;
}

// Exercise list for strength tracking

export class TrackedExerciseDTO {
  @ApiProperty()
  @IsUUID()
  exerciseId: string;

  @ApiProperty()
  @IsString()
  exerciseName: string;

  @ApiProperty({ description: 'Number of sessions with this exercise' })
  @IsNumber()
  sessionCount: number;

  @ApiProperty({ description: 'Date of last session' })
  @IsString()
  lastSessionDate: string;

  @ApiPropertyOptional({ type: Number, description: 'Current max weight' })
  @IsNumber()
  @IsOptional()
  currentMaxWeight?: number | null;
}

export class TrackedExercisesDTO {
  @ApiProperty({ type: [TrackedExerciseDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrackedExerciseDTO)
  exercises: TrackedExerciseDTO[];
}

export class TrackedExercisesResponse extends ItemResponse<TrackedExercisesDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: TrackedExercisesDTO;
}
