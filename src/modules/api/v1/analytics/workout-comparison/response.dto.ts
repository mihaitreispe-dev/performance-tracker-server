import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { CardioMetricType, WorkoutType } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

// Execution Summary for similar executions list
export class WorkoutExecutionSummaryDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiPropertyOptional({ type: String })
  @IsUUID()
  @IsOptional()
  workoutId?: string | null;

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

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  distanceMeters?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  paceSecondsPerKm?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  avgHeartRate?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  elevationGainMeters?: number | null;
}

// Match criteria used to find similar executions
export class MatchCriteriaDTO {
  @ApiPropertyOptional({ type: String })
  @IsUUID()
  @IsOptional()
  workoutId?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  workoutName?: string | null;

  @ApiPropertyOptional({ enum: WorkoutType })
  @IsEnumString(WorkoutType)
  @IsOptional()
  workoutType?: WorkoutType | null;
}

// Similar Executions response data
export class SimilarExecutionsDataDTO {
  @ApiProperty({ type: [WorkoutExecutionSummaryDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkoutExecutionSummaryDTO)
  executions: WorkoutExecutionSummaryDTO[];

  @ApiProperty({ type: MatchCriteriaDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => MatchCriteriaDTO)
  matchCriteria: MatchCriteriaDTO;
}

export class SimilarExecutionsResponse extends ItemResponse<SimilarExecutionsDataDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: SimilarExecutionsDataDTO;
}

// Metric summary for comparison
export class ComparisonMetricSummaryDTO {
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

// Split data for comparison
export class ComparisonSplitDTO {
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

// Set summary for strength comparison
export class ComparisonSetSummaryDTO {
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

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  totalVolume?: number | null;
}

// Full execution data for comparison
export class WorkoutComparisonExecutionDTO {
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

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  distanceMeters?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  paceSecondsPerKm?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  avgHeartRate?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  maxHeartRate?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  elevationGainMeters?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  caloriesBurned?: number | null;

  @ApiPropertyOptional({ type: [ComparisonMetricSummaryDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComparisonMetricSummaryDTO)
  @IsOptional()
  metricsSummary?: ComparisonMetricSummaryDTO[];

  @ApiPropertyOptional({ type: [ComparisonSplitDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComparisonSplitDTO)
  @IsOptional()
  splits?: ComparisonSplitDTO[];

  @ApiPropertyOptional({ type: [ComparisonSetSummaryDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComparisonSetSummaryDTO)
  @IsOptional()
  setsSummary?: ComparisonSetSummaryDTO[];
}

// Comparison highlight - identifies best performer
export class ComparisonHighlightDTO {
  @ApiProperty()
  @IsUUID()
  executionId: string;

  @ApiProperty()
  @IsNumber()
  value: number;
}

// Summary of comparison highlights
export class ComparisonSummaryDTO {
  @ApiPropertyOptional({ type: ComparisonHighlightDTO, description: 'Execution with best pace' })
  @IsObject()
  @ValidateNested()
  @Type(() => ComparisonHighlightDTO)
  @IsOptional()
  bestPace?: ComparisonHighlightDTO | null;

  @ApiPropertyOptional({ type: ComparisonHighlightDTO, description: 'Execution with fastest time' })
  @IsObject()
  @ValidateNested()
  @Type(() => ComparisonHighlightDTO)
  @IsOptional()
  fastestTime?: ComparisonHighlightDTO | null;

  @ApiPropertyOptional({ type: ComparisonHighlightDTO, description: 'Execution with lowest average HR' })
  @IsObject()
  @ValidateNested()
  @Type(() => ComparisonHighlightDTO)
  @IsOptional()
  lowestAvgHR?: ComparisonHighlightDTO | null;

  @ApiPropertyOptional({ type: ComparisonHighlightDTO, description: 'Execution with most elevation gain' })
  @IsObject()
  @ValidateNested()
  @Type(() => ComparisonHighlightDTO)
  @IsOptional()
  mostElevation?: ComparisonHighlightDTO | null;

  @ApiPropertyOptional({ type: ComparisonHighlightDTO, description: 'Execution with highest total volume (strength)' })
  @IsObject()
  @ValidateNested()
  @Type(() => ComparisonHighlightDTO)
  @IsOptional()
  highestVolume?: ComparisonHighlightDTO | null;
}

// Full comparison response data
export class WorkoutComparisonDataDTO {
  @ApiProperty({ type: [WorkoutComparisonExecutionDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkoutComparisonExecutionDTO)
  executions: WorkoutComparisonExecutionDTO[];

  @ApiProperty({ type: ComparisonSummaryDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => ComparisonSummaryDTO)
  comparisonSummary: ComparisonSummaryDTO;
}

export class WorkoutComparisonResponse extends ItemResponse<WorkoutComparisonDataDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WorkoutComparisonDataDTO;
}

// Coach athlete comparison - athlete execution info
export class AthleteExecutionDTO {
  @ApiProperty()
  @IsUUID()
  athleteId: string;

  @ApiProperty()
  @IsString()
  athleteName: string;

  @ApiPropertyOptional({ type: WorkoutComparisonExecutionDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => WorkoutComparisonExecutionDTO)
  @IsOptional()
  execution?: WorkoutComparisonExecutionDTO | null;

  @ApiPropertyOptional({ type: String, description: 'Reason if no execution found' })
  @IsString()
  @IsOptional()
  noDataReason?: string | null;
}

export class CoachAthleteComparisonDataDTO {
  @ApiProperty()
  @IsString()
  workoutName: string;

  @ApiProperty({ enum: WorkoutType })
  @IsEnumString(WorkoutType)
  workoutType: WorkoutType;

  @ApiProperty({ type: [AthleteExecutionDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AthleteExecutionDTO)
  athleteExecutions: AthleteExecutionDTO[];

  @ApiProperty({ type: ComparisonSummaryDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => ComparisonSummaryDTO)
  comparisonSummary: ComparisonSummaryDTO;
}

export class CoachAthleteComparisonResponse extends ItemResponse<CoachAthleteComparisonDataDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: CoachAthleteComparisonDataDTO;
}
