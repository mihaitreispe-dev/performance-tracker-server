import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';

// ==========================================
// Enums
// ==========================================

export enum CPModelType {
  EFTP = 'eftp',
  MORTON_3P = 'morton3',
  MONOD_SCHERRER = 'monod_scherrer',
}

// ==========================================
// Request DTOs
// ==========================================

export class PowerCurveQuery {
  @ApiPropertyOptional({
    type: Number,
    description: 'Number of days to analyze (default 90, max 365)',
    example: 90,
  })
  @IsNumber()
  @Min(1)
  @Max(365)
  @IsOptional()
  @Transform(({ value }) => (value ? Number.parseInt(value, 10) : undefined))
  days?: number;
}

export class CriticalPowerQuery {
  @ApiPropertyOptional({
    type: Number,
    description: 'Number of days to analyze (default 90, max 365)',
    example: 90,
  })
  @IsNumber()
  @Min(1)
  @Max(365)
  @IsOptional()
  @Transform(({ value }) => (value ? Number.parseInt(value, 10) : undefined))
  days?: number;

  @ApiPropertyOptional({
    enum: CPModelType,
    description: 'CP model type to use',
    example: CPModelType.MORTON_3P,
  })
  @IsEnum(CPModelType)
  @IsOptional()
  modelType?: CPModelType;
}

export class PowerCurveCompareQuery {
  @ApiProperty({
    type: [String],
    description: 'Array of date range strings in format "YYYY-MM-DD:YYYY-MM-DD"',
    example: ['2024-01-01:2024-03-31', '2024-04-01:2024-06-30'],
  })
  @IsArray()
  @IsString({ each: true })
  ranges: string[];
}

// ==========================================
// Response DTOs
// ==========================================

export class PowerCurvePointDTO {
  @ApiProperty({ description: 'Duration in seconds' })
  @IsNumber()
  durationSeconds: number;

  @ApiProperty({ description: 'Best power output in watts for this duration' })
  @IsNumber()
  bestPowerWatts: number;

  @ApiProperty({ type: String, format: 'date-time', description: 'When this power was achieved' })
  @IsString()
  achievedAt: string;

  @ApiProperty({ description: 'Workout execution ID where this power was achieved' })
  @IsString()
  workoutExecutionId: string;

  @ApiPropertyOptional({ description: 'Watts per kilogram if weight is available' })
  @IsNumber()
  @IsOptional()
  wattsPerKg?: number | null;
}

export class PowerCurveDTO {
  @ApiProperty({ type: [PowerCurvePointDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PowerCurvePointDTO)
  curve: PowerCurvePointDTO[];

  @ApiProperty({ description: 'Number of days analyzed' })
  @IsNumber()
  daysAnalyzed: number;

  @ApiProperty({ description: 'Number of workouts with power data' })
  @IsNumber()
  workoutsAnalyzed: number;

  @ApiPropertyOptional({ description: 'User weight in kg if available' })
  @IsNumber()
  @IsOptional()
  userWeightKg?: number | null;
}

export class PowerCurveResponse extends ItemResponse<PowerCurveDTO> {
  @ApiProperty({ type: PowerCurveDTO })
  declare data: PowerCurveDTO;
}

export class CriticalPowerAnalysisDTO {
  @ApiProperty({ enum: CPModelType, description: 'Model type used for calculation' })
  @IsEnum(CPModelType)
  modelType: CPModelType;

  @ApiProperty({ description: 'Critical Power in watts' })
  @IsNumber()
  criticalPower: number;

  @ApiProperty({ description: "W' (W-prime) anaerobic work capacity in joules" })
  @IsNumber()
  wPrime: number;

  @ApiPropertyOptional({ description: 'Estimated FTP (95% of CP) in watts' })
  @IsNumber()
  @IsOptional()
  eftp?: number | null;

  @ApiPropertyOptional({ description: 'Maximum instantaneous power (Morton 3-param only)' })
  @IsNumber()
  @IsOptional()
  pMax?: number | null;

  @ApiProperty({ description: 'Model fit confidence (0.0-1.0)' })
  @IsNumber()
  confidence: number;

  @ApiProperty({ description: 'R-squared value of the model fit' })
  @IsNumber()
  r2: number;

  @ApiProperty({ description: 'Number of data points used for fitting' })
  @IsNumber()
  dataPointsUsed: number;

  @ApiPropertyOptional({ description: 'Warning or info message about the calculation' })
  @IsString()
  @IsOptional()
  message?: string | null;
}

export class CriticalPowerDTO {
  @ApiProperty({ type: CriticalPowerAnalysisDTO })
  @ValidateNested()
  @Type(() => CriticalPowerAnalysisDTO)
  analysis: CriticalPowerAnalysisDTO;

  @ApiProperty({ type: [PowerCurvePointDTO], description: 'Power curve points used for calculation' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PowerCurvePointDTO)
  curvePoints: PowerCurvePointDTO[];

  @ApiPropertyOptional({ description: 'Previous CP value for comparison' })
  @IsNumber()
  @IsOptional()
  previousCp?: number | null;

  @ApiPropertyOptional({ description: 'Change from previous CP in watts' })
  @IsNumber()
  @IsOptional()
  cpChange?: number | null;
}

export class CriticalPowerResponse extends ItemResponse<CriticalPowerDTO> {
  @ApiProperty({ type: CriticalPowerDTO })
  declare data: CriticalPowerDTO;
}

export class SeasonComparisonCurveDTO {
  @ApiProperty({ description: 'Label for this season/period' })
  @IsString()
  label: string;

  @ApiProperty({ description: 'Start date of the period' })
  @IsString()
  startDate: string;

  @ApiProperty({ description: 'End date of the period' })
  @IsString()
  endDate: string;

  @ApiProperty({ type: [PowerCurvePointDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PowerCurvePointDTO)
  curve: PowerCurvePointDTO[];

  @ApiPropertyOptional({ type: CriticalPowerAnalysisDTO })
  @ValidateNested()
  @Type(() => CriticalPowerAnalysisDTO)
  @IsOptional()
  cpAnalysis?: CriticalPowerAnalysisDTO | null;
}

export class PowerCurveCompareDTO {
  @ApiProperty({ type: [SeasonComparisonCurveDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeasonComparisonCurveDTO)
  comparisons: SeasonComparisonCurveDTO[];
}

export class PowerCurveCompareResponse extends ItemResponse<PowerCurveCompareDTO> {
  @ApiProperty({ type: PowerCurveCompareDTO })
  declare data: PowerCurveCompareDTO;
}
