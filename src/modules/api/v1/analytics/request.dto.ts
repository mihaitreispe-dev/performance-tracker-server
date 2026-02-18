import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

export const AnalyticsPeriod = {
  SEVEN_DAYS: '7d',
  FOURTEEN_DAYS: '14d',
  THIRTY_DAYS: '30d',
  THIS_WEEK: 'this_week',
  LAST_WEEK: 'last_week',
  THIS_MONTH: 'this_month',
  LAST_MONTH: 'last_month',
  YTD: 'ytd',
} as const;
export type AnalyticsPeriod = (typeof AnalyticsPeriod)[keyof typeof AnalyticsPeriod];

export class WeeklySummaryQuery {
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description: 'Any date within the week (defaults to current week)',
  })
  @IsDateString()
  @IsOptional()
  date?: string;
}

export class PeriodSummaryQuery {
  @ApiPropertyOptional({
    enum: AnalyticsPeriod,
    description: 'Period to summarize (ignored if dateFrom/dateTo provided)',
    example: AnalyticsPeriod.SEVEN_DAYS,
  })
  @IsEnumString(AnalyticsPeriod)
  @IsOptional()
  period?: AnalyticsPeriod;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description: 'Custom start date (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description: 'Custom end date (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsOptional()
  dateTo?: string;
}

export class WorkoutAnalyticsParam {
  @ApiProperty({ description: 'Workout execution ID' })
  @IsUUID()
  executionId: string;
}

export class TrainingLoadHistoryQuery {
  @ApiPropertyOptional({
    type: Number,
    description: 'Number of days to include in history (default 90)',
    example: 90,
  })
  @IsOptional()
  days?: number;
}

export class StrengthProgressionParam {
  @ApiProperty({ description: 'Exercise ID' })
  @IsUUID()
  exerciseId: string;
}

export class StrengthProgressionQuery {
  @ApiPropertyOptional({
    type: Number,
    description: 'Number of days to include (default 90)',
    example: 90,
  })
  @IsOptional()
  days?: number;
}
