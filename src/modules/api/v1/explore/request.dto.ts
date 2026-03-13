import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class MetricIdParam {
  @ApiProperty({ description: 'Metric identifier', example: 'sleepQuality' })
  @IsString()
  metricId!: string;
}

export class MetricHistoryQuery {
  @ApiProperty({
    description: 'Start date for the history range (YYYY-MM-DD)',
    example: '2024-01-01',
  })
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    description: 'End date for the history range (YYYY-MM-DD)',
    example: '2024-01-31',
  })
  @IsDateString()
  endDate!: string;
}

export class PeriodComparisonQuery {
  @ApiProperty({
    description: 'Start date of current period (YYYY-MM-DD)',
    example: '2024-01-08',
  })
  @IsDateString()
  currentStart!: string;

  @ApiProperty({
    description: 'End date of current period (YYYY-MM-DD)',
    example: '2024-01-14',
  })
  @IsDateString()
  currentEnd!: string;

  @ApiPropertyOptional({
    description: 'Start date of previous period (auto-calculated if not provided)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  previousStart?: string;

  @ApiPropertyOptional({
    description: 'End date of previous period (auto-calculated if not provided)',
    example: '2024-01-07',
  })
  @IsOptional()
  @IsDateString()
  previousEnd?: string;
}
