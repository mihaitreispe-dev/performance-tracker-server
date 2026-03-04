import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { DataImportJobStatus, DataImportType } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { PageResponse } from 'src/lib/http/dto/page-response.dto';

export class RequestUploadUrlDTO {
  @ApiProperty({ description: 'The import job ID' })
  @IsUUID()
  jobId: string;

  @ApiProperty({ description: 'Presigned URL for uploading the archive' })
  @IsString()
  uploadUrl: string;

  @ApiProperty({ description: 'S3 key where the file will be stored' })
  @IsString()
  s3Key: string;

  @ApiProperty({ description: 'URL expiration time in seconds' })
  @IsInt()
  expiresIn: number;
}

export class RequestUploadUrlResponse extends ItemResponse<RequestUploadUrlDTO> {
  @ApiProperty({ type: RequestUploadUrlDTO })
  @IsObject({ always: true })
  @ValidateNested()
  declare data: RequestUploadUrlDTO;
}

export class DataImportJobDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty({ enum: DataImportType })
  importType: DataImportType;

  @ApiProperty({ enum: DataImportJobStatus })
  status: DataImportJobStatus;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  fileName?: string | null;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  fileSizeBytes?: number | null;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  totalItems?: number | null;

  @ApiProperty()
  @IsInt()
  processedItems: number;

  @ApiProperty()
  @IsInt()
  skippedItems: number;

  @ApiProperty()
  @IsInt()
  failedItems: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  errorMessage?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  startedAt?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  completedAt?: string | null;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class DataImportJobResponse extends ItemResponse<DataImportJobDTO> {
  @ApiProperty({ type: DataImportJobDTO })
  @IsObject({ always: true })
  @ValidateNested()
  declare data: DataImportJobDTO;
}

export class DataImportJobListResponse extends PageResponse<DataImportJobDTO> {
  @ApiProperty({ type: [DataImportJobDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  declare data: DataImportJobDTO[];
}
