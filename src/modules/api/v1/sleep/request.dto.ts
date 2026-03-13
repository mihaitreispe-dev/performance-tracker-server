import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { PageQuery } from 'src/lib/http/dto/page-request.dto';

export class ListSleepLogsQuery extends PageQuery {
  @ApiPropertyOptional({ type: String, format: 'date', description: 'Start date (inclusive)' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ type: String, format: 'date', description: 'End date (inclusive)' })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class CreateSleepLogBody {
  @ApiProperty({ type: String, format: 'date', description: 'Date of the sleep log (YYYY-MM-DD)' })
  @IsDateString()
  logDate: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Sleep start time (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Sleep end time (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  endTime?: string;

  @ApiProperty({ type: Number, description: 'Total sleep duration in seconds', minimum: 0 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  totalDurationSeconds: number;

  @ApiPropertyOptional({ type: Number, description: 'Awake duration in seconds', minimum: 0 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  awakeDurationSeconds?: number;

  @ApiPropertyOptional({ type: Number, description: 'Light sleep duration in seconds', minimum: 0 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  lightDurationSeconds?: number;

  @ApiPropertyOptional({ type: Number, description: 'Deep sleep duration in seconds', minimum: 0 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  deepDurationSeconds?: number;

  @ApiPropertyOptional({ type: Number, description: 'REM sleep duration in seconds', minimum: 0 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  remDurationSeconds?: number;

  @ApiPropertyOptional({ type: Number, description: 'Average resting heart rate (BPM)', minimum: 20, maximum: 200 })
  @IsInt()
  @Min(20)
  @Max(200)
  @Type(() => Number)
  @IsOptional()
  avgRestingHr?: number;

  @ApiPropertyOptional({ type: Number, description: 'Average HRV (ms)', minimum: 0, maximum: 300 })
  @IsInt()
  @Min(0)
  @Max(300)
  @Type(() => Number)
  @IsOptional()
  avgHrv?: number;
}

export class UpdateSleepLogBody {
  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Sleep start time (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Sleep end time (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional({ type: Number, description: 'Total sleep duration in seconds', minimum: 0 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  totalDurationSeconds?: number;

  @ApiPropertyOptional({ type: Number, description: 'Awake duration in seconds', minimum: 0 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  awakeDurationSeconds?: number;

  @ApiPropertyOptional({ type: Number, description: 'Light sleep duration in seconds', minimum: 0 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  lightDurationSeconds?: number;

  @ApiPropertyOptional({ type: Number, description: 'Deep sleep duration in seconds', minimum: 0 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  deepDurationSeconds?: number;

  @ApiPropertyOptional({ type: Number, description: 'REM sleep duration in seconds', minimum: 0 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  remDurationSeconds?: number;

  @ApiPropertyOptional({ type: Number, description: 'Average resting heart rate (BPM)', minimum: 20, maximum: 200 })
  @IsInt()
  @Min(20)
  @Max(200)
  @Type(() => Number)
  @IsOptional()
  avgRestingHr?: number;

  @ApiPropertyOptional({ type: Number, description: 'Average HRV (ms)', minimum: 0, maximum: 300 })
  @IsInt()
  @Min(0)
  @Max(300)
  @Type(() => Number)
  @IsOptional()
  avgHrv?: number;
}

export class SleepLogIdParam {
  @ApiProperty({ description: 'Sleep log ID' })
  @IsUUID()
  id: string;
}

export class SleepLogDateParam {
  @ApiProperty({ type: String, format: 'date', description: 'Date (YYYY-MM-DD)' })
  @IsString()
  date: string;
}

export class SetPrimarySleepSourceBody {
  @ApiProperty({ description: 'Provider to set as primary (manual, garmin, whoop, apple_health, oura)' })
  @IsString()
  provider: string;
}
