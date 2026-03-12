import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PersonalRecordType, WorkoutType } from 'src/database/interfaces';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

export const PRCategory = {
  STRENGTH: 'strength',
  CARDIO_DISTANCE: 'cardio_distance',
  CARDIO_OTHER: 'cardio_other',
} as const;
export type PRCategory = (typeof PRCategory)[keyof typeof PRCategory];

export class ListPersonalRecordsQuery {
  @ApiPropertyOptional({
    enum: PRCategory,
    description: 'Filter by PR category',
  })
  @IsEnumString(PRCategory)
  @IsOptional()
  category?: PRCategory;

  @ApiPropertyOptional({
    description: 'Filter by exercise ID (for strength PRs)',
  })
  @IsUUID()
  @IsOptional()
  exerciseId?: string;

  @ApiPropertyOptional({
    enum: WorkoutType,
    description: 'Filter by workout/sport type (e.g., run, cycling, swimming)',
  })
  @IsEnumString(WorkoutType)
  @IsOptional()
  workoutType?: WorkoutType;

  @ApiPropertyOptional({
    description: 'Return only current best PRs (default: true)',
    default: true,
  })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  currentOnly?: boolean;
}

export class PRHistoryQuery {
  @ApiProperty({
    enum: PersonalRecordType,
    description: 'Record type to get history for',
  })
  @IsEnumString(PersonalRecordType)
  recordType: PersonalRecordType;

  @ApiPropertyOptional({
    description: 'Exercise ID (required for strength PRs)',
  })
  @IsUUID()
  @IsOptional()
  exerciseId?: string;

  @ApiPropertyOptional({
    description: 'Workout type for sport-specific filtering',
  })
  @IsOptional()
  workoutType?: string;
}

export class ExercisePRsParam {
  @ApiProperty({ description: 'Exercise ID' })
  @IsUUID()
  exerciseId: string;
}

export class PREvolutionQuery {
  @ApiProperty({
    enum: PersonalRecordType,
    description: 'Record type to get evolution for',
  })
  @IsEnumString(PersonalRecordType)
  recordType: PersonalRecordType;

  @ApiPropertyOptional({
    description: 'Exercise ID (required for strength PRs)',
  })
  @IsUUID()
  @IsOptional()
  exerciseId?: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'Number of days to look back (default: 365)',
    example: 365,
  })
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(730)
  @IsOptional()
  days?: number;
}

export class PeriodComparisonQuery {
  @ApiProperty({
    type: String,
    format: 'date',
    description: 'Period 1 start date (YYYY-MM-DD)',
  })
  @IsDateString()
  period1Start: string;

  @ApiProperty({
    type: String,
    format: 'date',
    description: 'Period 1 end date (YYYY-MM-DD)',
  })
  @IsDateString()
  period1End: string;

  @ApiProperty({
    type: String,
    format: 'date',
    description: 'Period 2 start date (YYYY-MM-DD)',
  })
  @IsDateString()
  period2Start: string;

  @ApiProperty({
    type: String,
    format: 'date',
    description: 'Period 2 end date (YYYY-MM-DD)',
  })
  @IsDateString()
  period2End: string;
}

export class RecentPRsQuery {
  @ApiPropertyOptional({
    type: Number,
    description: 'Number of days to look back (default: 7)',
    example: 7,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  @IsOptional()
  days?: number;
}
