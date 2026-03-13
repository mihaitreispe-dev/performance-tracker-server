import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { PageResponse } from 'src/lib/http/dto/page-response.dto';

export class HrSampleDTO {
  @ApiProperty({ description: 'Unix timestamp in seconds' })
  @IsNumber()
  timestampSeconds: number;

  @ApiProperty({ description: 'Heart rate in BPM' })
  @IsNumber()
  heartRate: number;
}

export class SleepLogDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty({ type: String, format: 'date', description: 'Date of the sleep log (YYYY-MM-DD)' })
  @IsString()
  logDate: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  startTime?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  endTime?: string | null;

  @ApiProperty()
  @IsNumber()
  totalDurationSeconds: number;

  @ApiProperty()
  @IsNumber()
  awakeDurationSeconds: number;

  @ApiProperty()
  @IsNumber()
  lightDurationSeconds: number;

  @ApiProperty()
  @IsNumber()
  deepDurationSeconds: number;

  @ApiProperty()
  @IsNumber()
  remDurationSeconds: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  avgRestingHr?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  avgHrv?: number | null;

  @ApiPropertyOptional({ type: [HrSampleDTO], nullable: true })
  @IsArray()
  @ValidateNested({ each: true })
  @IsOptional()
  hrSamples?: HrSampleDTO[] | null;

  @ApiProperty({ description: 'Source of the sleep log (manual or garmin)' })
  @IsString()
  source: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  externalId?: string | null;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class SleepLogResponse extends ItemResponse<SleepLogDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: SleepLogDTO;
}

export class SleepLogListResponse extends PageResponse<SleepLogDTO> {
  @ApiProperty({ type: [SleepLogDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  declare data: SleepLogDTO[];
}

// Daily Sleep Summary DTOs

export class SleepStagesDTO {
  @ApiProperty({ description: 'Awake duration in seconds' })
  @IsNumber()
  awake: number;

  @ApiProperty({ description: 'Light sleep duration in seconds' })
  @IsNumber()
  light: number;

  @ApiProperty({ description: 'Deep sleep duration in seconds' })
  @IsNumber()
  deep: number;

  @ApiProperty({ description: 'REM sleep duration in seconds' })
  @IsNumber()
  rem: number;
}

export class DailySleepSourceDTO {
  @ApiProperty({ description: 'Data source (manual, garmin, whoop, apple_health, oura)' })
  @IsString()
  source: string;

  @ApiProperty({ description: 'Whether this is the primary/preferred source' })
  isPrimary: boolean;

  @ApiProperty({ type: SleepLogDTO })
  @ValidateNested()
  sleepLog: SleepLogDTO;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Computed or native sleep score (0-100)' })
  @IsNumber()
  @IsOptional()
  computedScore: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Sleep quality rating (1-5)' })
  @IsNumber()
  @IsOptional()
  qualityRating: number | null;
}

export class DailySleepSummaryDTO {
  @ApiProperty({ type: String, format: 'date', description: 'Date of the summary (YYYY-MM-DD)' })
  @IsString()
  date: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Primary source for this date' })
  @IsString()
  @IsOptional()
  primarySource: string | null;

  @ApiProperty({ description: 'Whether synced data is available from any wearable' })
  hasSyncedData: boolean;

  @ApiProperty({ type: [DailySleepSourceDTO], description: 'All available sleep data sources for this date' })
  @IsArray()
  @ValidateNested({ each: true })
  sources: DailySleepSourceDTO[];

  // Aggregated from primary source
  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  totalDurationSeconds: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Sleep score (0-100)' })
  @IsNumber()
  @IsOptional()
  sleepScore: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Sleep quality rating (1-5)' })
  @IsNumber()
  @IsOptional()
  qualityRating: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  avgHrv: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  avgRestingHr: number | null;

  @ApiPropertyOptional({ type: SleepStagesDTO, nullable: true })
  @ValidateNested()
  @IsOptional()
  stages: SleepStagesDTO | null;
}

export class DailySleepSummaryResponse extends ItemResponse<DailySleepSummaryDTO> {
  @ApiProperty({ type: DailySleepSummaryDTO })
  @IsObject({ always: true })
  @ValidateNested()
  declare data: DailySleepSummaryDTO;
}
