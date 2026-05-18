import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ContentItemKind, ContentItemStatus } from 'src/database/interfaces';

const VIDEO_MIME = /^video\/(mp4|webm|quicktime|x-m4v)$/;

export class CreateContentItemDto {
  @ApiProperty({ enum: ContentItemKind })
  @IsEnum(ContentItemKind)
  kind: ContentItemKind;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: 'Mime type of the video to upload. If set, a presigned PUT URL is returned.' })
  @IsOptional()
  @IsString()
  @Matches(VIDEO_MIME, { message: 'videoMimeType must be a supported video mime type' })
  videoMimeType?: string;

  @ApiPropertyOptional({ description: 'Duration in seconds (client-provided; refined after transcode in future)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  durationSeconds?: number;
}

export class UpdateContentItemDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ enum: ContentItemStatus })
  @IsEnum(ContentItemStatus)
  @IsOptional()
  status?: ContentItemStatus;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @IsOptional()
  durationSeconds?: number;
}

export class ListContentItemsQuery {
  @ApiPropertyOptional({ enum: ContentItemKind })
  @IsEnum(ContentItemKind)
  @IsOptional()
  kind?: ContentItemKind;

  @ApiPropertyOptional({ enum: ContentItemStatus })
  @IsEnum(ContentItemStatus)
  @IsOptional()
  status?: ContentItemStatus;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  tag?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}

export class ContentItemIdParam {
  @ApiProperty()
  @IsUUID()
  id: string;
}
