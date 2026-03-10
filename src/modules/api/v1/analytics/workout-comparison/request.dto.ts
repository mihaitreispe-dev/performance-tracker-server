import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsOptional, IsUUID } from 'class-validator';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

export const MatchType = {
  EXACT: 'exact',
  NAME: 'name',
  TYPE: 'type',
} as const;
export type MatchType = (typeof MatchType)[keyof typeof MatchType];

export class SimilarExecutionsParam {
  @ApiProperty({ description: 'Workout execution ID to find similar executions for' })
  @IsUUID()
  executionId: string;
}

export class SimilarExecutionsQuery {
  @ApiPropertyOptional({
    enum: MatchType,
    description: 'How to match similar executions',
    example: MatchType.EXACT,
  })
  @IsEnumString(MatchType)
  @IsOptional()
  matchType?: MatchType;

  @ApiPropertyOptional({
    type: Number,
    description: 'Maximum number of similar executions to return (default 10)',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description: 'Start date filter (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description: 'End date filter (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsOptional()
  dateTo?: string;
}

export class CompareWorkoutsBody {
  @ApiProperty({
    type: [String],
    description: 'Array of execution IDs to compare (2-4 executions)',
    example: ['uuid-1', 'uuid-2'],
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @IsUUID('4', { each: true })
  executionIds: string[];

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Include aggregated metric summaries (default true)',
  })
  @IsBoolean()
  @IsOptional()
  includeMetrics?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Include split/km data for cardio (default true)',
  })
  @IsBoolean()
  @IsOptional()
  includeSplits?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Include set completion summaries for strength (default true)',
  })
  @IsBoolean()
  @IsOptional()
  includeSets?: boolean;
}

export class CompareAthletesBody {
  @ApiProperty({ description: 'Workout ID to compare across athletes' })
  @IsUUID()
  workoutId: string;

  @ApiProperty({
    type: [String],
    description: 'Array of athlete user IDs to compare (2-4 athletes)',
    example: ['uuid-1', 'uuid-2'],
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @IsUUID('4', { each: true })
  athleteIds: string[];

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description: 'Start date filter (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description: 'End date filter (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsOptional()
  dateTo?: string;
}
