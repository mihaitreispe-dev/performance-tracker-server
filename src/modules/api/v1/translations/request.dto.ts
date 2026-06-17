import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsString, IsUUID } from 'class-validator';

import type { TranslationTargetType } from 'src/database/interfaces/content-translations-table.interface';

const TARGET_TYPES: TranslationTargetType[] = ['exercise_voiceover', 'exercise_intro', 'content_item'];

/** Identifies the thing being translated. */
export class TranslationTargetQuery {
  @ApiProperty({ enum: TARGET_TYPES, description: 'What is being translated.' })
  @IsIn(TARGET_TYPES)
  targetType: TranslationTargetType;

  @ApiProperty({ type: String, description: 'Exercise id or content-item id.' })
  @IsUUID('4')
  targetId: string;
}

export class RequestTranslationBody extends TranslationTargetQuery {
  @ApiProperty({
    type: [String],
    description: 'BCP-47 language subtags to translate into (e.g. ["es","fr","de"]).',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  locales: string[];

  @ApiPropertyOptional({ type: String, description: 'Source language (default "en").' })
  @IsString()
  sourceLocale?: string;
}

export class TranslationIdParam {
  @ApiProperty({ type: String, description: 'content_translations.id' })
  @IsUUID('4')
  id: string;
}

export class EditTranslationBody {
  @ApiProperty({ type: String, description: 'The human-reviewed translated text.' })
  @IsString()
  translatedText: string;
}

const SETTABLE_STATUSES = ['in_review', 'approved', 'published'] as const;
export type SettableReviewStatus = (typeof SETTABLE_STATUSES)[number];

export class SetReviewStatusBody {
  @ApiProperty({ enum: SETTABLE_STATUSES, description: 'New review status.' })
  @IsIn(SETTABLE_STATUSES)
  status: SettableReviewStatus;
}
