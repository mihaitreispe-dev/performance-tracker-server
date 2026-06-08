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

  /** Featured window. ISO timestamps; null = open-ended. */
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  featuredFrom?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  featuredUntil?: string | null;
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

/**
 * Body for POST /v1/content-items/:id/schedules — put a snack on the
 * caller's calendar for a given day. Date-only (no time); the
 * calendar buckets by day.
 */
export class ScheduleSnackBody {
  @ApiProperty({ type: String, format: 'date', description: 'Date to schedule the snack (YYYY-MM-DD)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'scheduledDate must be YYYY-MM-DD' })
  scheduledDate: string;
}

/**
 * Query for GET /v1/content-items/me/schedules — optional date window
 * so the calendar pulls only the visible month.
 */
export class ListSnackSchedulesQuery {
  @ApiPropertyOptional({ type: String, format: 'date', description: 'Inclusive lower bound (YYYY-MM-DD)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom must be YYYY-MM-DD' })
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ type: String, format: 'date', description: 'Inclusive upper bound (YYYY-MM-DD)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo must be YYYY-MM-DD' })
  @IsOptional()
  dateTo?: string;
}

/**
 * Body for POST /v1/content-items/:id/completions. Both fields are
 * optional. `durationSeconds` lets the client report how long the
 * user actually spent in the player (vs the snack's intrinsic
 * length); we round + clamp it server-side before storing.
 */
export class LogSnackCompletionBody {
  @ApiPropertyOptional({
    type: Number,
    description: 'Seconds the user spent in the player before completion fired.',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  durationSeconds?: number;
}
