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
