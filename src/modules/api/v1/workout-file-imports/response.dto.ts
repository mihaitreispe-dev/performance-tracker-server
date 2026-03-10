import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { WorkoutFileImportStatus } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';
import { ImportSportType, ParsedLapDTO } from './request.dto';

export class WorkoutFileUploadUrlDTO {
  @ApiProperty()
  @IsUUID()
  uploadId: string;

  @ApiProperty()
  @IsString()
  uploadUrl: string;

  @ApiProperty()
  @IsString()
  expiresAt: string;
}

export class WorkoutFileUploadUrlResponse extends ItemResponse<WorkoutFileUploadUrlDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WorkoutFileUploadUrlDTO;
}

export class WorkoutFileUploadResultDTO {
  @ApiProperty()
  @IsUUID()
  uploadId: string;

  @ApiProperty({ enum: WorkoutFileImportStatus })
  @IsEnumString(WorkoutFileImportStatus)
  status: WorkoutFileImportStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  workoutExecutionId?: string;

  @ApiPropertyOptional({ description: 'The activity start time extracted from the file' })
  @IsOptional()
  @IsString()
  workoutExecutionStartedAt?: string;

  @ApiPropertyOptional({ description: 'Detected sport type from the file' })
  @IsOptional()
  @IsString()
  sportType?: string;

  @ApiPropertyOptional({ description: 'ID of the created workout (for standalone imports)' })
  @IsOptional()
  @IsUUID()
  workoutId?: string;

  @ApiPropertyOptional({ description: 'ID of the created schedule (for standalone imports)' })
  @IsOptional()
  @IsUUID()
  workoutScheduleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  error?: string;
}

export class WorkoutFileUploadResultResponse extends ItemResponse<WorkoutFileUploadResultDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WorkoutFileUploadResultDTO;
}

export class WorkoutFileImportDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  fileName: string;

  @ApiProperty()
  @IsString()
  fileFormat: string;

  @ApiProperty({ enum: WorkoutFileImportStatus })
  @IsEnumString(WorkoutFileImportStatus)
  status: WorkoutFileImportStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  workoutScheduleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  workoutExecutionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiProperty()
  @IsString()
  createdAt: string;
}

export class WorkoutFileImportResponse extends ItemResponse<WorkoutFileImportDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WorkoutFileImportDTO;
}

export class WorkoutFileImportListResponse {
  @ApiProperty({ type: [WorkoutFileImportDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  declare data: WorkoutFileImportDTO[];
}

/** Pause period detected in the workout */
export class PausePeriodDTO {
  @ApiProperty({ description: 'Start time of the pause' })
  @IsString()
  startTime: string;

  @ApiProperty({ description: 'End time of the pause' })
  @IsString()
  endTime: string;

  @ApiProperty({ description: 'Duration of the pause in seconds' })
  @IsNumber()
  durationSeconds: number;
}

/** Preview data returned after parsing a file (before workout creation) */
export class ImportPreviewDTO {
  @ApiProperty()
  @IsUUID()
  uploadId: string;

  @ApiProperty({ description: 'Suggested workout name' })
  @IsString()
  suggestedName: string;

  @ApiProperty({ description: 'Detected sport type', enum: ImportSportType })
  @IsString()
  sportType: ImportSportType;

  @ApiPropertyOptional({ description: 'Original sport name from file' })
  @IsOptional()
  @IsString()
  sportName?: string;

  @ApiProperty({ description: 'Activity start time' })
  @IsString()
  startTime: string;

  @ApiPropertyOptional({ description: 'Activity end time' })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ description: 'Total duration in seconds' })
  @IsOptional()
  @IsNumber()
  totalDurationSeconds?: number;

  @ApiPropertyOptional({ description: 'Total distance in meters' })
  @IsOptional()
  @IsNumber()
  totalDistanceMeters?: number;

  @ApiPropertyOptional({ description: 'Elevation gain in meters' })
  @IsOptional()
  @IsNumber()
  elevationGainMeters?: number;

  @ApiProperty({ description: 'Parsed laps/intervals', type: [ParsedLapDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  laps: ParsedLapDTO[];

  @ApiProperty({ description: 'Number of metrics parsed from file' })
  @IsNumber()
  metricsCount: number;

  @ApiProperty({ description: 'Whether GPS route data is available' })
  hasRouteData: boolean;

  @ApiProperty({ description: 'Detected pause periods', type: [PausePeriodDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  pauses: PausePeriodDTO[];
}

export class ImportPreviewResponse extends ItemResponse<ImportPreviewDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: ImportPreviewDTO;
}
