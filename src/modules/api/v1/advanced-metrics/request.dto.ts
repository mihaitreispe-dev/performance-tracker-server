import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { FitnessMetricType } from 'src/database/interfaces';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

export class HistoryQuery {
  @ApiPropertyOptional({
    type: Number,
    description: 'Number of days to include in history (default 90, max 365)',
    example: 90,
  })
  @IsNumber()
  @Min(1)
  @Max(365)
  @IsOptional()
  @Transform(({ value }) => (value ? Number.parseInt(value, 10) : undefined))
  days?: number;
}

export class DateQuery {
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description: 'Date to query (default: today)',
    example: '2024-01-15',
  })
  @IsString()
  @IsOptional()
  date?: string;
}

export class WorkoutIdParam {
  @ApiProperty({ description: 'Workout execution ID' })
  @IsUUID()
  workoutId: string;
}

export class ThresholdOverrideBody {
  @ApiProperty({
    enum: FitnessMetricType,
    description: 'Type of threshold to override',
    example: FitnessMetricType.LTHR,
  })
  @IsEnumString(FitnessMetricType)
  metricType: FitnessMetricType;

  @ApiProperty({
    type: Number,
    description: 'Threshold value (e.g., HR in bpm, pace in min/km, power in watts)',
    example: 165,
  })
  @IsNumber()
  @Min(0)
  value: number;

  @ApiPropertyOptional({
    type: String,
    description: 'Optional notes about the threshold',
    example: 'Measured during lab test on 2024-01-15',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class FitnessFatiguePredictionBody {
  @ApiProperty({
    type: [Number],
    description: 'Array of planned daily TSS values',
    example: [50, 80, 40, 100, 60, 30, 0],
  })
  @IsNumber({}, { each: true })
  plannedDailyTSS: number[];
}

export class CorrelationQuery {
  @ApiPropertyOptional({
    type: Number,
    description: 'Number of days to analyze (default 90, max 365)',
    example: 90,
  })
  @IsNumber()
  @Min(7)
  @Max(365)
  @IsOptional()
  @Transform(({ value }) => (value ? Number.parseInt(value, 10) : undefined))
  days?: number;
}

export class LthrSportQuery {
  @ApiPropertyOptional({
    type: String,
    enum: ['running', 'cycling', 'general'],
    description: 'Sport type for sport-specific LTHR (default: general)',
    example: 'running',
  })
  @IsString()
  @IsOptional()
  sport?: 'running' | 'cycling' | 'general';
}

export class LthrHistoryQuery {
  @ApiPropertyOptional({
    type: Number,
    description: 'Number of days to include in history (default 90, max 365)',
    example: 90,
  })
  @IsNumber()
  @Min(1)
  @Max(365)
  @IsOptional()
  @Transform(({ value }) => (value ? Number.parseInt(value, 10) : undefined))
  days?: number;

  @ApiPropertyOptional({
    type: String,
    enum: ['running', 'cycling', 'general'],
    description: 'Sport type for sport-specific LTHR history',
    example: 'running',
  })
  @IsString()
  @IsOptional()
  sport?: 'running' | 'cycling' | 'general';
}

export class ManualLthrBody {
  @ApiProperty({
    type: Number,
    description: 'LTHR value in bpm',
    example: 165,
  })
  @IsNumber()
  @Min(60)
  @Max(220)
  value: number;

  @ApiPropertyOptional({
    type: String,
    enum: ['running', 'cycling', 'general'],
    description: 'Sport type for this LTHR (default: general)',
    example: 'running',
  })
  @IsString()
  @IsOptional()
  sport?: 'running' | 'cycling' | 'general';

  @ApiPropertyOptional({
    type: String,
    description: 'Optional notes about the LTHR',
    example: 'Measured during 20-min TT on 2024-01-15',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}

// ==========================================
// VO2Max DTOs
// ==========================================

export class Vo2MaxSportQuery {
  @ApiPropertyOptional({
    type: String,
    enum: ['running', 'cycling', 'general'],
    description: 'Sport type for sport-specific VO2max (default: general)',
    example: 'running',
  })
  @IsString()
  @IsOptional()
  sport?: 'running' | 'cycling' | 'general';
}

export class Vo2MaxHistoryQuery {
  @ApiPropertyOptional({
    type: Number,
    description: 'Number of days to include in history (default 90, max 365)',
    example: 90,
  })
  @IsNumber()
  @Min(1)
  @Max(365)
  @IsOptional()
  @Transform(({ value }) => (value ? Number.parseInt(value, 10) : undefined))
  days?: number;

  @ApiPropertyOptional({
    type: String,
    enum: ['running', 'cycling', 'general'],
    description: 'Sport type for sport-specific VO2max history',
    example: 'running',
  })
  @IsString()
  @IsOptional()
  sport?: 'running' | 'cycling' | 'general';
}

export class ManualVo2MaxBody {
  @ApiProperty({
    type: Number,
    description: 'VO2max value in ml/kg/min',
    example: 55,
  })
  @IsNumber()
  @Min(20)
  @Max(90)
  value: number;

  @ApiPropertyOptional({
    type: String,
    enum: ['running', 'cycling', 'general'],
    description: 'Sport type for this VO2max (default: general)',
    example: 'running',
  })
  @IsString()
  @IsOptional()
  sport?: 'running' | 'cycling' | 'general';

  @ApiPropertyOptional({
    type: String,
    description: 'Optional notes about the VO2max measurement',
    example: 'Measured during lab test on 2024-01-15',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
