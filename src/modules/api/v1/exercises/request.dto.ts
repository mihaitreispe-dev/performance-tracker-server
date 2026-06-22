import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ExerciseLevel, ExerciseVisibility, ExerciseVoiceoverMode } from 'src/database/interfaces';
import { type SortOptions, SortParam } from 'src/lib/http/decorators/sort-param';
import { SearchableQuery } from 'src/lib/http/dto/page-request.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

import { ExerciseSortField } from './types';

export class ListExercisesQuery extends SearchableQuery {
  @ApiPropertyOptional({ enum: ExerciseVisibility, description: 'Filter by visibility' })
  @IsEnumString(ExerciseVisibility)
  @IsOptional()
  visibility?: ExerciseVisibility;

  @ApiPropertyOptional({ type: String, description: 'Filter by category id (exercises linked to it).' })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ExerciseLevel, description: 'Filter by level' })
  @IsEnumString(ExerciseLevel)
  @IsOptional()
  level?: ExerciseLevel;

  @ApiPropertyOptional({
    type: String,
    description: 'Comma-separated equipment ids; matches exercises linked to ANY of them.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : value,
  )
  @IsArray()
  @IsUUID('4', { each: true })
  equipmentIds?: string[];

  @SortParam(ExerciseSortField)
  sort?: SortOptions<'name' | 'created_at' | 'updated_at'>;
}

export class CreateExerciseBody {
  @ApiProperty({ description: 'Exercise name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: String, description: 'Exercise description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [String], description: 'Category IDs to link (replaces existing on update)' })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  categoryIds?: string[];

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Movement pattern ID (single). Pass null to clear.' })
  @IsUUID()
  @IsOptional()
  movementPatternId?: string | null;

  @ApiPropertyOptional({ enum: ExerciseLevel, description: 'Exercise level' })
  @IsEnumString(ExerciseLevel)
  @IsOptional()
  level?: ExerciseLevel;

  @ApiPropertyOptional({ enum: ExerciseVisibility, description: 'Visibility (private/public)' })
  @IsEnumString(ExerciseVisibility)
  @IsOptional()
  visibility?: ExerciseVisibility;

  /**
   * Required. Every exercise ships with a video — the server uses this to
   * mint the upload key and the MediaConvert pipeline derives the thumbnail
   * from the file the client PUTs to S3. Image-only exercises are no
   * longer supported.
   */
  @ApiProperty({ type: String, description: 'Video MIME type (e.g. video/mp4). Required.' })
  @IsString()
  videoMimeType: string;

  @ApiPropertyOptional({ type: [String], description: 'Equipment IDs to link' })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  equipmentIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Primary muscle group IDs' })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  primaryMuscleGroupIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Secondary muscle group IDs' })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  secondaryMuscleGroupIds?: string[];
}

export class UpdateExerciseBody {
  @ApiPropertyOptional({ type: String, description: 'Exercise name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ type: String, description: 'Exercise description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [String], description: 'Category IDs to link (replaces existing on update)' })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  categoryIds?: string[];

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Movement pattern ID (single). Pass null to clear.' })
  @IsUUID()
  @IsOptional()
  movementPatternId?: string | null;

  @ApiPropertyOptional({ enum: ExerciseLevel, description: 'Exercise level' })
  @IsEnumString(ExerciseLevel)
  @IsOptional()
  level?: ExerciseLevel;

  @ApiPropertyOptional({ enum: ExerciseVisibility, description: 'Visibility (private/public)' })
  @IsEnumString(ExerciseVisibility)
  @IsOptional()
  visibility?: ExerciseVisibility;

  @ApiPropertyOptional({ type: String, description: 'Video MIME type (e.g. video/mp4) - provide to reset video' })
  @IsString()
  @IsOptional()
  videoMimeType?: string;

  @ApiPropertyOptional({ type: [String], description: 'Equipment IDs to link (replaces existing)' })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  equipmentIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Primary muscle group IDs (replaces existing)' })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  primaryMuscleGroupIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Secondary muscle group IDs (replaces existing)' })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  secondaryMuscleGroupIds?: string[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Intro content_item ID (kind=exercise_intro). Pass null to clear.',
  })
  @IsUUID()
  @IsOptional()
  introContentItemId?: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Inline intro start marker (seconds into the main video). Pass null to clear.',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  introStartSeconds?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Inline intro end marker (seconds into the main video). The Skip-intro button skips to this point.',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  introEndSeconds?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'Where the execution (demonstration) begins, in seconds into the main video. May be earlier than introEndSeconds to overlap the explanation. Skip-intro seeks here. Pass null to clear (execution then starts at introEndSeconds).',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  executionStartSeconds?: number | null;

  /**
   * Voice-over mode. Setting to 'off' clears any previously uploaded
   * recording; setting to 'recorded' requires a separate upload via
   * the voice-over upload-URL endpoint OR a previous upload already
   * on file.
   */
  @ApiPropertyOptional({ enum: ExerciseVoiceoverMode })
  @IsEnumString(ExerciseVoiceoverMode)
  @IsOptional()
  voiceoverMode?: ExerciseVoiceoverMode;
}

/**
 * Request body for the voice-over upload URL endpoint. Mirror of
 * RequestExerciseVideoUploadBody but for the recorded VO audio file.
 * The caller PUTs the bytes to the returned presigned URL; the server
 * stamps voiceover_s3_* + flips mode to 'recorded' once the upload
 * completes.
 */
export class RequestExerciseVoiceoverUploadBody {
  @ApiProperty({
    type: String,
    description: 'Audio MIME type — audio/mpeg, audio/mp4, audio/webm, audio/wav are accepted.',
  })
  @IsString()
  mimeType: string;
}

export class ImportExerciseFromVimeoBody {
  @ApiProperty({
    description: 'A vimeo.com/{id}, player.vimeo.com/video/{id}, or just the numeric Vimeo id.',
    example: 'https://vimeo.com/76979871',
  })
  @IsString()
  vimeoUrl: string;

  @ApiPropertyOptional({ description: 'Override the exercise name (defaults to the Vimeo video title).' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Override the description (defaults to the Vimeo video description).' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: ExerciseVisibility })
  @IsEnumString(ExerciseVisibility)
  @IsOptional()
  visibility?: ExerciseVisibility;
}

export class ExerciseIdParam {
  @ApiProperty({ description: 'Exercise ID' })
  @IsUUID()
  id: string;
}

export class UpdateExerciseChainBody {
  @ApiProperty({ type: [String], description: 'Ordered list of exercise IDs in the chain (position 0 = easiest)' })
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds: string[];
}
