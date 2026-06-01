import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RequestInlineImageUploadDto {
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] })
  @IsString()
  mimeType: string;

  @ApiPropertyOptional({ description: 'Source file size in bytes, informational only.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  sizeBytes?: number;
}
