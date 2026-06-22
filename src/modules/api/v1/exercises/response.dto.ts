import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  ExerciseLevel,
  ExerciseStatus,
  ExerciseVisibility,
  ExerciseVoiceoverMode,
} from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { PageResponse } from 'src/lib/http/dto/page-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

export class MediaAssetDTO {
  @ApiProperty()
  @IsUrl()
  url: string;

  @ApiPropertyOptional({ type: String })
  @IsUrl()
  @IsOptional()
  poster?: string;

  @ApiPropertyOptional({ type: String })
  @IsUrl()
  @IsOptional()
  thumbnail?: string;

  @ApiProperty()
  @IsString()
  mimeType: string;

  /**
   * Orientation of this rendition, e.g. '9:16' (portrait, primary) or
   * '16:9' (wide). Absent for non-oriented assets (e.g. the audio track).
   * Lets orientation-aware players pick the rendition that fits the
   * viewport instead of always letterboxing the portrait clip.
   */
  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  aspectRatio?: string;
}

export class EquipmentDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;
}

export class MuscleGroupDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}

export class ExerciseImageDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUrl()
  url: string;

  @ApiProperty()
  position: number;
}

/**
 * A published translation of this exercise's voice-over or intro, in one
 * language. Surfaced to the player so it can show captions / speak the
 * translated script in the athlete's language. Only published rows reach
 * here.
 */
export class ExerciseTranslationDTO {
  @ApiProperty({ type: String, description: "'exercise_voiceover' | 'exercise_intro'" })
  targetType: string;
  @ApiProperty({ type: String }) locale: string;
  @ApiProperty({ type: String, nullable: true }) translatedText: string | null;
  @ApiProperty({ type: String, nullable: true }) captionVttUrl: string | null;
  @ApiProperty({ type: String, nullable: true }) dubbedAudioUrl: string | null;
}

export class ExerciseDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  description?: string | null;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  cues: string[];

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  category?: string | null;

  @ApiPropertyOptional({ enum: ExerciseLevel })
  @IsEnumString(ExerciseLevel)
  @IsOptional()
  level?: ExerciseLevel | null;

  @ApiProperty({ enum: ExerciseVisibility })
  @IsEnumString(ExerciseVisibility)
  visibility: ExerciseVisibility;

  @ApiProperty({ enum: ExerciseStatus })
  @IsEnumString(ExerciseStatus)
  status: ExerciseStatus;

  @ApiProperty()
  @IsUUID()
  userId: string;

  /**
   * Auto-extracted thumbnail URL (signed CloudFront / S3 URL). Null until
   * the MediaConvert pipeline finishes — clients should render a
   * placeholder while `status` is `upload_pending`/`upload_done`/
   * `assets_pending`. There is no separate uploaded-image fallback any
   * more: every exercise's thumbnail comes from its video.
   *
   * Field is named `picture` for backwards compatibility with existing
   * consumers — semantically it's the auto-extracted thumbnail.
   */
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Auto-extracted thumbnail URL. Null until video processing completes.' })
  @IsUrl()
  @IsOptional()
  picture?: string | null;

  @ApiProperty({ type: [ExerciseImageDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  images: ExerciseImageDTO[];

  @ApiProperty({ type: [MediaAssetDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  assets: MediaAssetDTO[];

  @ApiProperty({ type: [EquipmentDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  equipment: EquipmentDTO[];

  @ApiProperty({ type: [MuscleGroupDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  primaryMuscles: MuscleGroupDTO[];

  @ApiProperty({ type: [MuscleGroupDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  secondaryMuscles: MuscleGroupDTO[];

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsUUID()
  @IsOptional()
  introContentItemId?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Inline intro start marker (seconds).' })
  @IsOptional()
  introStartSeconds?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Inline intro end marker (seconds).' })
  @IsOptional()
  introEndSeconds?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Execution (demonstration) start, seconds. May overlap the intro; Skip-intro seeks here. Null = starts at introEndSeconds.',
  })
  @IsOptional()
  executionStartSeconds?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Vimeo source video id, if imported from Vimeo.',
  })
  @IsOptional()
  vimeoVideoId?: string | null;

  /**
   * Per-exercise voice-over config. The player consumes these to
   * decide whether to play an audio cue when the exercise becomes
   * active.
   */
  @ApiProperty({ enum: ExerciseVoiceoverMode })
  @IsEnumString(ExerciseVoiceoverMode)
  voiceoverMode: ExerciseVoiceoverMode;

  /**
   * Signed playback URL for the recorded voice-over audio file.
   * Non-null only when `voiceoverMode === 'recorded'` AND the upload
   * has finished. Same signing strategy as `picture` / `assets`.
   */
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsUrl()
  @IsOptional()
  voiceoverUrl?: string | null;

  /**
   * MIME type of the recorded voice-over file (e.g. `audio/mp4`,
   * `audio/mpeg`, `audio/webm`). Null when no recording exists.
   * Lets the client pick an appropriate `<audio>` decoder hint.
   */
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  voiceoverMimeType?: string | null;

  /**
   * Override script for generated-from-cues mode. Null → the client
   * joins this exercise's `cues` array as the script verbatim. Set →
   * client speaks this text. Ignored when mode is 'off' or 'recorded'.
   */
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  voiceoverScript?: string | null;

  /**
   * Published translations of this exercise's voice-over + intro. Only
   * populated on single-exercise GET (the player path) — absent on list
   * responses to avoid an N+1. The player picks the entry matching the
   * athlete's language for captions / translated narration.
   */
  @ApiPropertyOptional({ type: () => [ExerciseTranslationDTO] })
  @IsOptional()
  translations?: ExerciseTranslationDTO[];

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class ExerciseResponse extends ItemResponse<ExerciseDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: ExerciseDTO;
}

export class ExerciseListResponse extends PageResponse<ExerciseDTO> {
  @ApiProperty({ type: [ExerciseDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  declare data: ExerciseDTO[];
}

class ExerciseUploadUrlDTO {
  @ApiProperty()
  @IsUrl()
  video: string;
}

export class ExerciseUploadUrlResponse extends ItemResponse<ExerciseUploadUrlDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: ExerciseUploadUrlDTO;
}

export class ExerciseChainMemberDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  /** Auto-extracted thumbnail URL; named `picture` for back-compat. */
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  picture?: string | null;

  @ApiPropertyOptional({ enum: ExerciseLevel })
  @IsEnumString(ExerciseLevel)
  @IsOptional()
  level?: ExerciseLevel | null;

  @ApiProperty()
  @IsNumber()
  position: number;
}

export class ExerciseChainDTO {
  @ApiProperty()
  @IsUUID()
  chainId: string;

  @ApiProperty({ type: [ExerciseChainMemberDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  members: ExerciseChainMemberDTO[];
}

export class ExerciseChainResponse extends ItemResponse<ExerciseChainDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: ExerciseChainDTO;
}
