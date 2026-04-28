import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class OAuthCallbackQuery {
  @ApiProperty({ description: 'Authorization code from OAuth provider' })
  @IsString()
  code: string;

  @ApiPropertyOptional({ description: 'State parameter for CSRF protection' })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiPropertyOptional({ description: 'Scope of access granted' })
  @IsString()
  @IsOptional()
  scope?: string;
}

export class GarminSleepLevelInterval {
  @ApiProperty()
  startTimeInSeconds: number;

  @ApiProperty()
  endTimeInSeconds: number;
}

export class GarminSleepLevelsMap {
  @ApiPropertyOptional({ type: [GarminSleepLevelInterval] })
  awake?: GarminSleepLevelInterval[];

  @ApiPropertyOptional({ type: [GarminSleepLevelInterval] })
  light?: GarminSleepLevelInterval[];

  @ApiPropertyOptional({ type: [GarminSleepLevelInterval] })
  deep?: GarminSleepLevelInterval[];

  @ApiPropertyOptional({ type: [GarminSleepLevelInterval] })
  rem?: GarminSleepLevelInterval[];
}

export class GarminSleepSummary {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  userAccessToken: string;

  @ApiProperty()
  summaryId: string;

  @ApiProperty({ description: 'Date in YYYY-MM-DD format' })
  calendarDate: string;

  @ApiProperty()
  startTimeInSeconds: number;

  @ApiPropertyOptional()
  startTimeOffsetInSeconds?: number;

  @ApiProperty()
  durationInSeconds: number;

  @ApiPropertyOptional()
  sleepLevelsMap?: GarminSleepLevelsMap;

  @ApiPropertyOptional()
  restingHeartRateInBeatsPerMinute?: number;

  @ApiPropertyOptional()
  avgOvernightHrv?: number;

  @ApiPropertyOptional({ description: 'Heart rate samples with time offset as keys' })
  timeOffsetHeartRateSamples?: Record<string, number>;
}

export class GarminWebhookBody {
  @ApiPropertyOptional({ description: 'Array of activity summaries' })
  activities?: GarminActivitySummary[];

  @ApiPropertyOptional({ description: 'Array of sleep summaries' })
  sleeps?: GarminSleepSummary[];
}

export class GarminActivitySummary {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  userAccessToken: string;

  @ApiProperty()
  summaryId: string;

  @ApiProperty()
  activityId: number;

  @ApiProperty()
  activityName: string;

  @ApiProperty()
  activityType: string;

  @ApiProperty()
  startTimeInSeconds: number;

  @ApiProperty()
  startTimeOffsetInSeconds: number;

  @ApiProperty()
  durationInSeconds: number;

  @ApiPropertyOptional()
  distanceInMeters?: number;

  @ApiPropertyOptional()
  averageHeartRateInBeatsPerMinute?: number;

  @ApiPropertyOptional()
  maxHeartRateInBeatsPerMinute?: number;

  @ApiPropertyOptional()
  averageSpeedInMetersPerSecond?: number;

  @ApiPropertyOptional()
  maxSpeedInMetersPerSecond?: number;

  @ApiPropertyOptional()
  totalElevationGainInMeters?: number;

  @ApiPropertyOptional()
  totalElevationLossInMeters?: number;
}

export class TrainingPeaksSyncQuery {
  @ApiPropertyOptional({
    description: 'Sync workouts after this date (ISO 8601 format)',
    example: '2024-01-01T00:00:00Z',
  })
  @IsDateString()
  @IsOptional()
  after?: string;

  @ApiPropertyOptional({
    description: 'Sync workouts before this date (ISO 8601 format)',
    example: '2024-12-31T23:59:59Z',
  })
  @IsDateString()
  @IsOptional()
  before?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of workouts to sync',
    default: 100,
    minimum: 1,
    maximum: 500,
  })
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  limit?: number;
}
