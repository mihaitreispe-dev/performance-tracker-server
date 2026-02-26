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
