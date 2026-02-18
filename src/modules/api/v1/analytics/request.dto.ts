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
  @ApiProperty({
    enum: AnalyticsPeriod,
    description: 'Period to summarize',
    example: AnalyticsPeriod.SEVEN_DAYS,
  })
  @IsEnumString(AnalyticsPeriod)
  period: AnalyticsPeriod;
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
