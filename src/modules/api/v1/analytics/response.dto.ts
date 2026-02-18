import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
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
