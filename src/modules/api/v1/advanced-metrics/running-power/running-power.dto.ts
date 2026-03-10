import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';

// ==========================================
// Enums
// ==========================================

export enum PowerSource {
  STRYD = 'stryd',
  GARMIN = 'garmin',
  COROS = 'coros',
  POLAR = 'polar',
  CALCULATED = 'calculated',
  UNKNOWN = 'unknown',
}

// ==========================================
// Request DTOs
// ==========================================

export class RunningPowerQuery {
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
}

// ==========================================
// Response DTOs
// ==========================================

export class RunningPowerSummaryDTO {
  @ApiProperty({ description: 'Average power across all running workouts in watts' })
  @IsNumber()
  avgPower: number;

  @ApiProperty({ description: 'Maximum power recorded in watts' })
  @IsNumber()
  maxPower: number;

  @ApiProperty({ description: 'Normalized power average in watts' })
  @IsNumber()
  avgNormalizedPower: number;

  @ApiProperty({ description: 'Average running effectiveness in meters per watt' })
  @IsNumber()
  avgRunningEffectiveness: number;

  @ApiProperty({ description: 'Average form power in watts' })
  @IsNumber()
  avgFormPower: number;

  @ApiProperty({ description: 'Form power as percentage of total power' })
  @IsNumber()
  formPowerRatio: number;

  @ApiProperty({ enum: PowerSource, description: 'Source of power data' })
  @IsString()
  powerSource: PowerSource;

  @ApiProperty({ description: 'Number of workouts analyzed' })
  @IsNumber()
  workoutsAnalyzed: number;

  @ApiProperty({ description: 'Total distance in meters' })
  @IsNumber()
  totalDistanceMeters: number;

  @ApiProperty({ description: 'Total duration in seconds' })
  @IsNumber()
  totalDurationSeconds: number;
}

export class RunningPowerSummaryResponse extends ItemResponse<RunningPowerSummaryDTO> {
  @ApiProperty({ type: RunningPowerSummaryDTO })
  declare data: RunningPowerSummaryDTO;
}

export class RunningEffectivenessPointDTO {
  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  date: string;

  @ApiProperty({ description: 'Running effectiveness (m/W)' })
  @IsNumber()
  runningEffectiveness: number;

  @ApiProperty({ description: 'Average power for this workout in watts' })
  @IsNumber()
  avgPower: number;

  @ApiProperty({ description: 'Average pace in seconds per kilometer' })
  @IsNumber()
  avgPace: number;

  @ApiProperty({ description: 'Workout execution ID' })
  @IsString()
  workoutExecutionId: string;

  @ApiPropertyOptional({ description: 'Distance in meters' })
  @IsNumber()
  @IsOptional()
  distanceMeters?: number | null;
}

export class RunningEffectivenessDTO {
  @ApiProperty({ type: [RunningEffectivenessPointDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RunningEffectivenessPointDTO)
  trend: RunningEffectivenessPointDTO[];

  @ApiProperty({ description: 'Average running effectiveness for the period' })
  @IsNumber()
  periodAverage: number;

  @ApiPropertyOptional({ description: 'Change from start of period' })
  @IsNumber()
  @IsOptional()
  changeFromStart?: number | null;

  @ApiPropertyOptional({ description: 'Best running effectiveness in the period' })
  @IsNumber()
  @IsOptional()
  bestEffectiveness?: number | null;
}

export class RunningEffectivenessResponse extends ItemResponse<RunningEffectivenessDTO> {
  @ApiProperty({ type: RunningEffectivenessDTO })
  declare data: RunningEffectivenessDTO;
}

export class PowerZoneDTO {
  @ApiProperty({ description: 'Zone number (1-7)' })
  @IsNumber()
  zone: number;

  @ApiProperty({ description: 'Zone name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Minimum power for this zone in watts' })
  @IsNumber()
  minPower: number;

  @ApiProperty({ description: 'Maximum power for this zone in watts' })
  @IsNumber()
  maxPower: number;

  @ApiProperty({ description: 'Time spent in zone in seconds' })
  @IsNumber()
  timeInZoneSeconds: number;

  @ApiProperty({ description: 'Percentage of total time in this zone' })
  @IsNumber()
  percentageOfTotal: number;

  @ApiProperty({ description: 'Color code for visualization' })
  @IsString()
  color: string;
}

export class RunningPowerZonesDTO {
  @ApiProperty({ type: [PowerZoneDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PowerZoneDTO)
  zones: PowerZoneDTO[];

  @ApiProperty({ description: 'Critical Power / FTP used for zone calculation' })
  @IsNumber()
  thresholdPower: number;

  @ApiProperty({ description: 'Total time analyzed in seconds' })
  @IsNumber()
  totalTimeSeconds: number;

  @ApiProperty({ description: 'Number of workouts analyzed' })
  @IsNumber()
  workoutsAnalyzed: number;
}

export class RunningPowerZonesResponse extends ItemResponse<RunningPowerZonesDTO> {
  @ApiProperty({ type: RunningPowerZonesDTO })
  declare data: RunningPowerZonesDTO;
}

export class PowerPacePointDTO {
  @ApiProperty({ description: 'Pace in seconds per kilometer' })
  @IsNumber()
  pace: number;

  @ApiProperty({ description: 'Power in watts' })
  @IsNumber()
  power: number;

  @ApiProperty({ description: 'Terrain type (flat, uphill, downhill, mixed)' })
  @IsString()
  terrain: string;

  @ApiProperty({ description: 'Workout execution ID' })
  @IsString()
  workoutExecutionId: string;

  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  date: string;
}

export class RegressionLineDTO {
  @ApiProperty({ description: 'Slope of the regression line' })
  @IsNumber()
  slope: number;

  @ApiProperty({ description: 'Y-intercept of the regression line' })
  @IsNumber()
  intercept: number;
}

export class PowerPaceCorrelationDTO {
  @ApiProperty({ type: [PowerPacePointDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PowerPacePointDTO)
  points: PowerPacePointDTO[];

  @ApiProperty({ description: 'Pearson correlation coefficient (-1 to 1)' })
  @IsNumber()
  correlationCoefficient: number;

  @ApiProperty({ type: RegressionLineDTO })
  @ValidateNested()
  @Type(() => RegressionLineDTO)
  regressionLine: RegressionLineDTO;

  @ApiProperty({ description: 'Number of data points' })
  @IsNumber()
  dataPointsCount: number;
}

export class PowerPaceCorrelationResponse extends ItemResponse<PowerPaceCorrelationDTO> {
  @ApiProperty({ type: PowerPaceCorrelationDTO })
  declare data: PowerPaceCorrelationDTO;
}
