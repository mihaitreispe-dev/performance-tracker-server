import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DataImportType } from 'src/database/interfaces';

export class RequestUploadUrlBody {
  @ApiProperty({ description: 'Type of archive to import', enum: DataImportType })
  @IsEnum(DataImportType)
  importType: DataImportType;

  @ApiProperty({ description: 'Original filename of the archive' })
  @IsString()
  fileName: string;

  @ApiPropertyOptional({ description: 'MIME type of the file' })
  @IsString()
  @IsOptional()
  contentType?: string;
}

export class ConfirmUploadBody {
  @ApiProperty({ description: 'The import job ID from request-upload' })
  @IsString()
  jobId: string;

  @ApiProperty({ description: 'File size in bytes' })
  fileSizeBytes: number;
}

export class StartProcessingBody {
  @ApiProperty({ description: 'The import job ID to start processing' })
  @IsString()
  jobId: string;
}
