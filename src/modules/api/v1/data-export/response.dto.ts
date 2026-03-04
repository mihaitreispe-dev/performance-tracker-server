import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { DataExportCategory, DataExportFormat, DataExportJobStatus } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { PageResponse } from 'src/lib/http/dto/page-response.dto';

export class DataExportJobDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty({ enum: DataExportFormat })
  format: DataExportFormat;

  @ApiProperty({ enum: DataExportCategory, isArray: true })
  categories: DataExportCategory[];

  @ApiProperty({ enum: DataExportJobStatus })
  status: DataExportJobStatus;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  downloadUrl?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  expiresAt?: string | null;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  totalItems?: number | null;

  @ApiProperty()
  @IsInt()
  processedItems: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  fileSizeBytes?: number | null;

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

export class DataExportJobResponse extends ItemResponse<DataExportJobDTO> {
  @ApiProperty({ type: DataExportJobDTO })
  @IsObject({ always: true })
  @ValidateNested()
  declare data: DataExportJobDTO;
}

export class DataExportJobListResponse extends PageResponse<DataExportJobDTO> {
  @ApiProperty({ type: [DataExportJobDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  declare data: DataExportJobDTO[];
}

export class DownloadUrlResponse {
  @ApiProperty({ description: 'Presigned download URL' })
  @IsString()
  downloadUrl: string;

  @ApiProperty({ description: 'URL expiration time' })
  @IsString()
  expiresAt: string;
}
