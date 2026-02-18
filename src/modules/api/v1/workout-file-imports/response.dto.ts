import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { WorkoutFileImportStatus } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

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
