import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { DataExportCategory, DataExportFormat } from 'src/database/interfaces';

export class RequestExportBody {
  @ApiProperty({ description: 'Export format', enum: DataExportFormat })
  @IsEnum(DataExportFormat)
  format: DataExportFormat;

  @ApiPropertyOptional({
    description: 'Categories to include in export (defaults to all)',
    enum: DataExportCategory,
    isArray: true,
  })
  @IsArray()
  @IsEnum(DataExportCategory, { each: true })
  @IsOptional()
  categories?: DataExportCategory[];
}

export class ExportJobIdParam {
  @ApiProperty({ description: 'Export job ID' })
  @IsUUID()
  @IsString()
  jobId: string;
}
