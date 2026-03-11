import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { IllnessType, WellnessCheckinSource } from 'src/database/interfaces';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

export class QuickWellnessCheckinBody {
  @ApiPropertyOptional({ description: 'Sleep quality (1-5: 1=poor, 5=excellent)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  sleepQuality?: number;

  @ApiPropertyOptional({ description: 'Energy level (1-5: 1=exhausted, 5=energized)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  energyLevel?: number;

  @ApiPropertyOptional({
    description: 'Muscle soreness (1-5 inverted: 1=very sore, 5=no soreness)',
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  muscleSoreness?: number;

  @ApiPropertyOptional({ description: 'Stress level (1-5 inverted: 1=very stressed, 5=relaxed)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  stressLevel?: number;

  @ApiPropertyOptional({ description: 'Training readiness (1-5: 1=not ready, 5=very ready)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  trainingReadiness?: number;

  @ApiPropertyOptional({ description: 'Time taken to complete check-in in seconds' })
  @IsOptional()
  @IsInt()
  @Min(0)
  completionSeconds?: number;

  @ApiPropertyOptional({ enum: WellnessCheckinSource, description: 'Source of check-in' })
  @IsOptional()
  @IsEnumString(WellnessCheckinSource)
  source?: WellnessCheckinSource;
}

export class CreateQuickWellnessCheckinBody extends QuickWellnessCheckinBody {
  @ApiProperty({ description: 'Check-in date (YYYY-MM-DD)', example: '2024-01-15' })
  @IsDateString()
  checkinDate!: string;
}

export class UpdateQuickWellnessCheckinBody extends QuickWellnessCheckinBody {}

export class WellnessCheckinDateParam {
  @ApiProperty({ description: 'Date (YYYY-MM-DD)', example: '2024-01-15' })
  @IsDateString()
  date!: string;
}

export class WellnessCheckinIdParam {
  @ApiProperty({ description: 'Wellness check-in ID' })
  @IsString()
  id!: string;
}

export class WellnessCheckinHistoryQuery {
  @ApiPropertyOptional({ description: 'Number of days to look back', default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

// Illness Logs

export class IllnessLogBody {
  @ApiProperty({ enum: IllnessType, description: 'Type of illness' })
  @IsEnumString(IllnessType)
  illnessType!: IllnessType;

  @ApiProperty({ description: 'Severity (1-10)', minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  severity!: number;

  @ApiProperty({ description: 'Start date (YYYY-MM-DD)', example: '2024-01-15' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ description: 'End date if resolved (YYYY-MM-DD)', example: '2024-01-18' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'List of symptoms', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptoms?: string[];

  @ApiPropertyOptional({ description: 'Whether this affects training', default: true })
  @IsOptional()
  @IsBoolean()
  affectsTraining?: boolean;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateIllnessLogBody {
  @ApiPropertyOptional({ enum: IllnessType, description: 'Type of illness' })
  @IsOptional()
  @IsEnumString(IllnessType)
  illnessType?: IllnessType;

  @ApiPropertyOptional({ description: 'Severity (1-10)', minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  severity?: number;

  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD)', example: '2024-01-15' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date if resolved (YYYY-MM-DD)', example: '2024-01-18' })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional({ description: 'List of symptoms', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptoms?: string[];

  @ApiPropertyOptional({ description: 'Whether this affects training' })
  @IsOptional()
  @IsBoolean()
  affectsTraining?: boolean;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class IllnessLogIdParam {
  @ApiProperty({ description: 'Illness log ID' })
  @IsString()
  id!: string;
}

export class ListIllnessLogsQuery {
  @ApiPropertyOptional({ enum: IllnessType, description: 'Filter by illness type' })
  @IsOptional()
  @IsEnumString(IllnessType)
  illnessType?: IllnessType;

  @ApiPropertyOptional({ description: 'Filter active only (not resolved)' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  activeOnly?: boolean;

  @ApiPropertyOptional({ description: 'Number of days to look back', default: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}
