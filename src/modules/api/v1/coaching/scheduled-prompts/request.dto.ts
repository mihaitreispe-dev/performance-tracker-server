import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ScheduledPromptType, ScheduleFrequency } from 'src/database/interfaces';

export class CreateScheduledPromptBody {
  @ApiPropertyOptional({ description: 'Target athlete ID (null for all active athletes)' })
  @IsUUID()
  @IsOptional()
  athleteId?: string;

  @ApiProperty({
    description: 'Prompt type',
    enum: Object.values(ScheduledPromptType),
  })
  @IsIn(Object.values(ScheduledPromptType))
  promptType: ScheduledPromptType;

  @ApiProperty({ description: 'Notification title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Notification message/body' })
  @IsString()
  @IsOptional()
  message?: string;

  @ApiProperty({
    description: 'Schedule frequency',
    enum: Object.values(ScheduleFrequency),
  })
  @IsIn(Object.values(ScheduleFrequency))
  frequency: ScheduleFrequency;

  @ApiPropertyOptional({
    description: 'Days of week for specific_days frequency (0=Sun, 6=Sat)',
    type: [Number],
    example: [1, 3, 5],
  })
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsOptional()
  daysOfWeek?: number[];

  @ApiProperty({
    description: 'Time to send (HH:MM format)',
    example: '09:00',
  })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'scheduledTime must be in HH:MM format',
  })
  scheduledTime: string;

  @ApiProperty({
    description: 'IANA timezone',
    example: 'America/New_York',
  })
  @IsString()
  timezone: string;

  @ApiProperty({
    description: 'Start date (YYYY-MM-DD)',
    example: '2024-01-15',
  })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({
    description: 'End date (YYYY-MM-DD)',
    example: '2024-12-31',
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class UpdateScheduledPromptBody {
  @ApiPropertyOptional({ description: 'Target athlete ID (null for all active athletes)' })
  @IsUUID()
  @IsOptional()
  athleteId?: string | null;

  @ApiPropertyOptional({
    description: 'Prompt type',
    enum: Object.values(ScheduledPromptType),
  })
  @IsIn(Object.values(ScheduledPromptType))
  @IsOptional()
  promptType?: ScheduledPromptType;

  @ApiPropertyOptional({ description: 'Notification title' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Notification message/body' })
  @IsString()
  @IsOptional()
  message?: string | null;

  @ApiPropertyOptional({
    description: 'Schedule frequency',
    enum: Object.values(ScheduleFrequency),
  })
  @IsIn(Object.values(ScheduleFrequency))
  @IsOptional()
  frequency?: ScheduleFrequency;

  @ApiPropertyOptional({
    description: 'Days of week for specific_days frequency (0=Sun, 6=Sat)',
    type: [Number],
    example: [1, 3, 5],
  })
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsOptional()
  daysOfWeek?: number[] | null;

  @ApiPropertyOptional({
    description: 'Time to send (HH:MM format)',
    example: '09:00',
  })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'scheduledTime must be in HH:MM format',
  })
  @IsOptional()
  scheduledTime?: string;

  @ApiPropertyOptional({
    description: 'IANA timezone',
    example: 'America/New_York',
  })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Start date (YYYY-MM-DD)',
    example: '2024-01-15',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date (YYYY-MM-DD)',
    example: '2024-12-31',
  })
  @IsDateString()
  @IsOptional()
  endDate?: string | null;
}

export class ScheduledPromptIdParam {
  @ApiProperty({ description: 'Scheduled prompt ID' })
  @IsUUID()
  id: string;
}

export class ListScheduledPromptsQuery {
  @ApiPropertyOptional({ description: 'Filter by athlete ID' })
  @IsUUID()
  @IsOptional()
  athleteId?: string;

  @ApiPropertyOptional({
    description: 'Filter by prompt type',
    enum: Object.values(ScheduledPromptType),
  })
  @IsIn(Object.values(ScheduledPromptType))
  @IsOptional()
  promptType?: ScheduledPromptType;

  @ApiPropertyOptional({ description: 'Filter by enabled status' })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Limit number of results' })
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset for pagination' })
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}
