import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { PageResponse } from 'src/lib/http/dto/page-response.dto';

export class HrSampleDTO {
  @ApiProperty({ description: 'Unix timestamp in seconds' })
  @IsNumber()
  timestampSeconds: number;

  @ApiProperty({ description: 'Heart rate in BPM' })
  @IsNumber()
  heartRate: number;
}

// Enhanced Sleep Score DTOs

export class SleepScoreBreakdownDTO {
  @ApiProperty({ description: 'Duration subscore (0-100)' })
  @IsNumber()
  durationSubscore: number;

  @ApiProperty({ description: 'Efficiency subscore (0-100)' })
  @IsNumber()
  efficiencySubscore: number;

  @ApiProperty({ description: 'Architecture subscore (0-100)' })
  @IsNumber()
  architectureSubscore: number;

  @ApiProperty({ description: 'HRV subscore (0-100)' })
  @IsNumber()
  hrvSubscore: number;

  @ApiProperty({ description: 'HR nadir subscore (0-100)' })
  @IsNumber()
  hrSubscore: number;

  @ApiPropertyOptional({ description: 'Sleep debt penalty points' })
  @IsNumber()
  @IsOptional()
  sleepDebtPenalty?: number;

  @ApiPropertyOptional({ description: 'Baseline trend bonus points' })
  @IsNumber()
  @IsOptional()
  baselineBonus?: number;
}

export class SleepZScoresDTO {
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'TST z-score relative to baseline' })
  @IsNumber()
  @IsOptional()
  tst: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Sleep efficiency z-score' })
  @IsNumber()
  @IsOptional()
  se: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'HRV z-score' })
  @IsNumber()
  @IsOptional()
  hrv: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'HR nadir z-score (inverted)' })
  @IsNumber()
  @IsOptional()
  hrNadir: number | null;
}

export class SleepInsightDTO {
  @ApiProperty({ enum: ['positive', 'warning', 'concern'], description: 'Insight severity type' })
  @IsString()
  type: 'positive' | 'warning' | 'concern';

  @ApiProperty({
    enum: ['duration', 'efficiency', 'architecture', 'hrv', 'hr', 'debt'],
    description: 'Category of the insight',
  })
  @IsString()
  category: 'duration' | 'efficiency' | 'architecture' | 'hrv' | 'hr' | 'debt';

  @ApiProperty({ description: 'Human-readable insight message' })
  @IsString()
  message: string;
}

export class EnhancedSleepMetricsDTO {
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Sleep onset latency in seconds' })
  @IsNumber()
  @IsOptional()
  sleepOnsetLatencySeconds: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Wake after sleep onset in seconds' })
  @IsNumber()
  @IsOptional()
  wasoSeconds: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Number of wake episodes' })
  @IsNumber()
  @IsOptional()
  wasoCount: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Time in bed in seconds' })
  @IsNumber()
  @IsOptional()
  timeInBedSeconds: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Sleep efficiency (0-1)' })
  @IsNumber()
  @IsOptional()
  sleepEfficiency: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Lowest heart rate during sleep' })
  @IsNumber()
  @IsOptional()
  hrNadir: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Average HRV in first half of sleep' })
  @IsNumber()
  @IsOptional()
  hrvFirstHalfAvg: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Average HRV in second half of sleep' })
  @IsNumber()
  @IsOptional()
  hrvSecondHalfAvg: number | null;
}

export class SleepLogDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty({ type: String, format: 'date', description: 'Date of the sleep log (YYYY-MM-DD)' })
  @IsString()
  logDate: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  startTime?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  endTime?: string | null;

  @ApiProperty()
  @IsNumber()
  totalDurationSeconds: number;

  @ApiProperty()
  @IsNumber()
  awakeDurationSeconds: number;

  @ApiProperty()
  @IsNumber()
  lightDurationSeconds: number;

  @ApiProperty()
  @IsNumber()
  deepDurationSeconds: number;

  @ApiProperty()
  @IsNumber()
  remDurationSeconds: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  avgRestingHr?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  avgHrv?: number | null;

  @ApiPropertyOptional({ type: [HrSampleDTO], nullable: true })
  @IsArray()
  @ValidateNested({ each: true })
  @IsOptional()
  hrSamples?: HrSampleDTO[] | null;

  @ApiProperty({ description: 'Source of the sleep log (manual or garmin)' })
  @IsString()
  source: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  externalId?: string | null;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class SleepLogResponse extends ItemResponse<SleepLogDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: SleepLogDTO;
}

export class SleepLogListResponse extends PageResponse<SleepLogDTO> {
  @ApiProperty({ type: [SleepLogDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  declare data: SleepLogDTO[];
}

// Daily Sleep Summary DTOs

export class SleepStagesDTO {
  @ApiProperty({ description: 'Awake duration in seconds' })
  @IsNumber()
  awake: number;

  @ApiProperty({ description: 'Light sleep duration in seconds' })
  @IsNumber()
  light: number;

  @ApiProperty({ description: 'Deep sleep duration in seconds' })
  @IsNumber()
  deep: number;

  @ApiProperty({ description: 'REM sleep duration in seconds' })
  @IsNumber()
  rem: number;
}

export class DailySleepSourceDTO {
  @ApiProperty({ description: 'Data source (manual, garmin, whoop, apple_health, oura)' })
  @IsString()
  source: string;

  @ApiProperty({ description: 'Whether this is the primary/preferred source' })
  isPrimary: boolean;

  @ApiProperty({ type: SleepLogDTO })
  @ValidateNested()
  sleepLog: SleepLogDTO;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Computed or native sleep score (0-100)' })
  @IsNumber()
  @IsOptional()
  computedScore: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Sleep quality rating (1-5)' })
  @IsNumber()
  @IsOptional()
  qualityRating: number | null;
}

export class DailySleepSummaryDTO {
  @ApiProperty({ type: String, format: 'date', description: 'Date of the summary (YYYY-MM-DD)' })
  @IsString()
  date: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Primary source for this date' })
  @IsString()
  @IsOptional()
  primarySource: string | null;

  @ApiProperty({ description: 'Whether synced data is available from any wearable' })
  hasSyncedData: boolean;

  @ApiProperty({ type: [DailySleepSourceDTO], description: 'All available sleep data sources for this date' })
  @IsArray()
  @ValidateNested({ each: true })
  sources: DailySleepSourceDTO[];

  // Aggregated from primary source
  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  totalDurationSeconds: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Sleep score (0-100)' })
  @IsNumber()
  @IsOptional()
  sleepScore: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Sleep quality rating (1-5)' })
  @IsNumber()
  @IsOptional()
  qualityRating: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  avgHrv: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  avgRestingHr: number | null;

  @ApiPropertyOptional({ type: SleepStagesDTO, nullable: true })
  @ValidateNested()
  @IsOptional()
  stages: SleepStagesDTO | null;

  // Enhanced sleep scoring fields
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Score confidence (0-1)' })
  @IsNumber()
  @IsOptional()
  scoreConfidence: number | null;

  @ApiPropertyOptional({ type: SleepScoreBreakdownDTO, nullable: true, description: 'Score breakdown by category' })
  @ValidateNested()
  @Type(() => SleepScoreBreakdownDTO)
  @IsOptional()
  scoreBreakdown: SleepScoreBreakdownDTO | null;

  @ApiPropertyOptional({ type: SleepZScoresDTO, nullable: true, description: 'Z-scores relative to baseline' })
  @ValidateNested()
  @Type(() => SleepZScoresDTO)
  @IsOptional()
  zScores: SleepZScoresDTO | null;

  @ApiPropertyOptional({ type: [SleepInsightDTO], description: 'Sleep insights and recommendations' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SleepInsightDTO)
  @IsOptional()
  insights: SleepInsightDTO[];

  @ApiPropertyOptional({ type: EnhancedSleepMetricsDTO, nullable: true, description: 'Enhanced sleep metrics' })
  @ValidateNested()
  @Type(() => EnhancedSleepMetricsDTO)
  @IsOptional()
  enhancedMetrics: EnhancedSleepMetricsDTO | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: '7-day sleep debt in hours (negative = deficit)' })
  @IsNumber()
  @IsOptional()
  sleepDebt7Day: number | null;
}

export class DailySleepSummaryResponse extends ItemResponse<DailySleepSummaryDTO> {
  @ApiProperty({ type: DailySleepSummaryDTO })
  @IsObject({ always: true })
  @ValidateNested()
  declare data: DailySleepSummaryDTO;
}
