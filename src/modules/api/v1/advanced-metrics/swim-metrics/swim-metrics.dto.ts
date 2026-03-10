import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';

// ==========================================
// Enums
// ==========================================

export enum StrokeType {
  FREESTYLE = 'freestyle',
  BACKSTROKE = 'backstroke',
  BREASTSTROKE = 'breaststroke',
  BUTTERFLY = 'butterfly',
  IM = 'im',
  DRILL = 'drill',
  UNKNOWN = 'unknown',
}

export enum PoolLength {
  SCY = 25, // Short Course Yards (25 yards)
  SCM = 25, // Short Course Meters (25 meters)
  LCM = 50, // Long Course Meters (50 meters)
}

export enum CSSCalculationMethod {
  TT_400_200 = 'tt_400_200',
  TT_1000_500 = 'tt_1000_500',
  PACE_CURVE = 'pace_curve',
}

// ==========================================
// Request DTOs
// ==========================================

export class SwimMetricsQuery {
  @ApiPropertyOptional({
    type: Number,
    description: 'Number of days to analyze (default 30, max 365)',
    example: 30,
  })
  @IsNumber()
  @Min(1)
  @Max(365)
  @IsOptional()
  @Transform(({ value }) => (value ? Number.parseInt(value, 10) : undefined))
  days?: number;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Filter for pool swims only',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  poolOnly?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Filter for open water swims only',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  openWaterOnly?: boolean;
}

// ==========================================
// Response DTOs
// ==========================================

export class SwimSummaryDTO {
  @ApiProperty({ description: 'Total distance swum in meters' })
  @IsNumber()
  totalDistance: number;

  @ApiProperty({ description: 'Average SWOLF score' })
  @IsNumber()
  avgSwolf: number;

  @ApiProperty({ description: 'Average stroke rate in strokes per minute' })
  @IsNumber()
  avgStrokeRate: number;

  @ApiProperty({ description: 'Average pace in seconds per 100 meters' })
  @IsNumber()
  avgPace: number;

  @ApiProperty({ description: 'Number of pool swim sessions' })
  @IsNumber()
  poolSwims: number;

  @ApiProperty({ description: 'Number of open water swim sessions' })
  @IsNumber()
  openWaterSwims: number;

  @ApiProperty({ description: 'Total duration in seconds' })
  @IsNumber()
  totalDurationSeconds: number;

  @ApiProperty({ description: 'Number of workouts analyzed' })
  @IsNumber()
  workoutsAnalyzed: number;

  @ApiPropertyOptional({ description: 'Best SWOLF score' })
  @IsNumber()
  @IsOptional()
  bestSwolf?: number | null;

  @ApiPropertyOptional({ description: 'Best pace in seconds per 100m' })
  @IsNumber()
  @IsOptional()
  bestPace?: number | null;
}

export class SwimSummaryResponse extends ItemResponse<SwimSummaryDTO> {
  @ApiProperty({ type: SwimSummaryDTO })
  declare data: SwimSummaryDTO;
}

export class SwolfPointDTO {
  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  date: string;

  @ApiProperty({ description: 'SWOLF score for the session' })
  @IsNumber()
  swolf: number;

  @ApiProperty({ description: 'Average stroke count per length' })
  @IsNumber()
  strokeCount: number;

  @ApiProperty({ description: 'Time per length in seconds' })
  @IsNumber()
  timePerLength: number;

  @ApiProperty({ description: 'Pool length in meters (25 or 50)' })
  @IsNumber()
  poolLength: number;

  @ApiProperty({ description: 'Workout execution ID' })
  @IsString()
  workoutExecutionId: string;

  @ApiPropertyOptional({ description: 'Distance in meters' })
  @IsNumber()
  @IsOptional()
  distanceMeters?: number | null;
}

export class SwolfAnalysisDTO {
  @ApiProperty({ type: [SwolfPointDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SwolfPointDTO)
  trend: SwolfPointDTO[];

  @ApiProperty({ description: 'Average SWOLF for the period' })
  @IsNumber()
  periodAverage: number;

  @ApiPropertyOptional({ description: 'Best SWOLF in the period' })
  @IsNumber()
  @IsOptional()
  bestSwolf?: number | null;

  @ApiPropertyOptional({ description: 'Change from start of period' })
  @IsNumber()
  @IsOptional()
  changeFromStart?: number | null;
}

export class SwolfAnalysisResponse extends ItemResponse<SwolfAnalysisDTO> {
  @ApiProperty({ type: SwolfAnalysisDTO })
  declare data: SwolfAnalysisDTO;
}

export class StrokeRatePointDTO {
  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  date: string;

  @ApiProperty({ description: 'Stroke rate in strokes per minute' })
  @IsNumber()
  strokeRate: number;

  @ApiProperty({ description: 'Distance per stroke in meters' })
  @IsNumber()
  distancePerStroke: number;

  @ApiProperty({ description: 'Average pace for this workout in sec/100m' })
  @IsNumber()
  avgPace: number;

  @ApiProperty({ description: 'Workout execution ID' })
  @IsString()
  workoutExecutionId: string;
}

export class StrokeRateAnalysisDTO {
  @ApiProperty({ type: [StrokeRatePointDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StrokeRatePointDTO)
  trend: StrokeRatePointDTO[];

  @ApiProperty({ description: 'Average stroke rate for the period' })
  @IsNumber()
  periodAverageRate: number;

  @ApiProperty({ description: 'Average distance per stroke for the period' })
  @IsNumber()
  periodAverageDPS: number;

  @ApiPropertyOptional({ description: 'Best distance per stroke' })
  @IsNumber()
  @IsOptional()
  bestDPS?: number | null;
}

export class StrokeRateAnalysisResponse extends ItemResponse<StrokeRateAnalysisDTO> {
  @ApiProperty({ type: StrokeRateAnalysisDTO })
  declare data: StrokeRateAnalysisDTO;
}

export class PaceZoneDTO {
  @ApiProperty({ description: 'Zone number (1-7)' })
  @IsNumber()
  zone: number;

  @ApiProperty({ description: 'Zone name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Minimum pace for this zone in sec/100m' })
  @IsNumber()
  minPace: number;

  @ApiProperty({ description: 'Maximum pace for this zone in sec/100m' })
  @IsNumber()
  maxPace: number;

  @ApiProperty({ description: 'Color code for visualization' })
  @IsString()
  color: string;
}

export class CriticalSwimSpeedDTO {
  @ApiProperty({ description: 'Critical Swim Speed in seconds per 100m' })
  @IsNumber()
  css: number;

  @ApiProperty({ enum: CSSCalculationMethod, description: 'Method used to calculate CSS' })
  @IsEnum(CSSCalculationMethod)
  calculationMethod: CSSCalculationMethod;

  @ApiProperty({ type: [PaceZoneDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaceZoneDTO)
  paceZones: PaceZoneDTO[];

  @ApiProperty({ description: 'Confidence in the CSS calculation (0-1)' })
  @IsNumber()
  confidence: number;

  @ApiPropertyOptional({ description: 'Previous CSS for comparison' })
  @IsNumber()
  @IsOptional()
  previousCss?: number | null;

  @ApiPropertyOptional({ description: 'Change from previous CSS' })
  @IsNumber()
  @IsOptional()
  cssChange?: number | null;

  @ApiPropertyOptional({ description: 'Message about the calculation' })
  @IsString()
  @IsOptional()
  message?: string | null;
}

export class CriticalSwimSpeedResponse extends ItemResponse<CriticalSwimSpeedDTO> {
  @ApiProperty({ type: CriticalSwimSpeedDTO })
  declare data: CriticalSwimSpeedDTO;
}

export class StrokeTypeBreakdownDTO {
  @ApiProperty({ enum: StrokeType })
  @IsEnum(StrokeType)
  strokeType: StrokeType;

  @ApiProperty({ description: 'Total distance for this stroke in meters' })
  @IsNumber()
  totalDistance: number;

  @ApiProperty({ description: 'Average pace in seconds per 100m' })
  @IsNumber()
  avgPace: number;

  @ApiProperty({ description: 'Average SWOLF for this stroke' })
  @IsNumber()
  avgSwolf: number;

  @ApiProperty({ description: 'Percentage of total swim distance' })
  @IsNumber()
  percentageOfTotal: number;

  @ApiProperty({ description: 'Number of sessions with this stroke' })
  @IsNumber()
  sessionCount: number;

  @ApiProperty({ description: 'Color for visualization' })
  @IsString()
  color: string;
}

export class StrokeBreakdownDTO {
  @ApiProperty({ type: [StrokeTypeBreakdownDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StrokeTypeBreakdownDTO)
  breakdown: StrokeTypeBreakdownDTO[];

  @ApiProperty({ description: 'Total distance analyzed in meters' })
  @IsNumber()
  totalDistance: number;

  @ApiProperty({ description: 'Number of workouts analyzed' })
  @IsNumber()
  workoutsAnalyzed: number;
}

export class StrokeBreakdownResponse extends ItemResponse<StrokeBreakdownDTO> {
  @ApiProperty({ type: StrokeBreakdownDTO })
  declare data: StrokeBreakdownDTO;
}
