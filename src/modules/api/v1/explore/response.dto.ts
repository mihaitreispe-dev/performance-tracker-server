import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class MetricDataPointDTO {
  @ApiProperty({ description: 'Date of the data point', example: '2024-01-15' })
  @IsString()
  date!: string;

  @ApiPropertyOptional({ description: 'Value of the metric (null if no data)', example: 4.5 })
  @IsOptional()
  @IsNumber()
  value!: number | null;
}

export class MetricSummaryDTO {
  @ApiProperty({ description: 'Average value over the period', example: 3.8 })
  @IsNumber()
  average!: number;

  @ApiProperty({ description: 'Minimum value over the period', example: 2 })
  @IsNumber()
  min!: number;

  @ApiProperty({ description: 'Maximum value over the period', example: 5 })
  @IsNumber()
  max!: number;

  @ApiProperty({ description: 'Number of data points with values', example: 7 })
  @IsNumber()
  count!: number;
}

export class MetricHistoryDTO {
  @ApiProperty({ description: 'Metric identifier', example: 'sleepQuality' })
  @IsString()
  metricId!: string;

  @ApiProperty({ description: 'Human-readable metric label', example: 'Sleep Quality' })
  @IsString()
  metricLabel!: string;

  @ApiProperty({ description: 'Unit of measurement', example: '/5' })
  @IsString()
  unit!: string;

  @ApiProperty({ type: [MetricDataPointDTO], description: 'Array of data points' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetricDataPointDTO)
  dataPoints!: MetricDataPointDTO[];

  @ApiProperty({ type: MetricSummaryDTO, description: 'Summary statistics for the period' })
  @IsObject()
  @ValidateNested()
  @Type(() => MetricSummaryDTO)
  summary!: MetricSummaryDTO;
}

export class MetricHistoryResponse {
  @ApiProperty({ type: MetricHistoryDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => MetricHistoryDTO)
  data!: MetricHistoryDTO;
}

export class MetricOptionDTO {
  @ApiProperty({ description: 'Metric identifier', example: 'sleepQuality' })
  @IsString()
  id!: string;

  @ApiProperty({ description: 'Human-readable label', example: 'Sleep Quality' })
  @IsString()
  label!: string;

  @ApiProperty({ description: 'Unit of measurement', example: '/5' })
  @IsString()
  unit!: string;
}

export class MetricChapterDTO {
  @ApiProperty({ description: 'Chapter/category name', example: 'Wellness' })
  @IsString()
  chapter!: string;

  @ApiProperty({ type: [MetricOptionDTO], description: 'Metrics in this chapter' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetricOptionDTO)
  metrics!: MetricOptionDTO[];
}

export class AvailableMetricsResponse {
  @ApiProperty({ type: [MetricChapterDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetricChapterDTO)
  data!: MetricChapterDTO[];
}

export class PeriodWorkoutSummaryDTO {
  @ApiProperty({ description: 'Number of workouts', example: 5 })
  @IsNumber()
  workoutCount!: number;

  @ApiProperty({ description: 'Total duration in seconds', example: 16200 })
  @IsNumber()
  totalDurationSeconds!: number;

  @ApiProperty({ description: 'Total distance in meters', example: 32000 })
  @IsNumber()
  totalDistanceMeters!: number;

  @ApiProperty({ description: 'Total volume in kg (strength)', example: 12500 })
  @IsNumber()
  totalVolumeKg!: number;

  @ApiProperty({ description: 'Total sets (strength)', example: 45 })
  @IsNumber()
  totalSets!: number;

  @ApiProperty({ description: 'Total reps (strength)', example: 540 })
  @IsNumber()
  totalReps!: number;
}

export class PeriodComparisonDTO {
  @ApiProperty({ type: PeriodWorkoutSummaryDTO, description: 'Current period summary' })
  @IsObject()
  @ValidateNested()
  @Type(() => PeriodWorkoutSummaryDTO)
  current!: PeriodWorkoutSummaryDTO;

  @ApiProperty({ type: PeriodWorkoutSummaryDTO, description: 'Previous period summary' })
  @IsObject()
  @ValidateNested()
  @Type(() => PeriodWorkoutSummaryDTO)
  previous!: PeriodWorkoutSummaryDTO;

  @ApiProperty({ description: 'Start date of current period', example: '2024-01-08' })
  @IsString()
  currentPeriodStart!: string;

  @ApiProperty({ description: 'End date of current period', example: '2024-01-14' })
  @IsString()
  currentPeriodEnd!: string;

  @ApiProperty({ description: 'Start date of previous period', example: '2024-01-01' })
  @IsString()
  previousPeriodStart!: string;

  @ApiProperty({ description: 'End date of previous period', example: '2024-01-07' })
  @IsString()
  previousPeriodEnd!: string;
}

export class PeriodComparisonResponse {
  @ApiProperty({ type: PeriodComparisonDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => PeriodComparisonDTO)
  data!: PeriodComparisonDTO;
}
