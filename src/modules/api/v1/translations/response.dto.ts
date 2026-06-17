import { ApiProperty } from '@nestjs/swagger';

import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import type {
  TranslationJobStatus,
  TranslationReviewStatus,
  TranslationTargetType,
} from 'src/database/interfaces/content-translations-table.interface';

export class TranslationDTO {
  @ApiProperty({ type: String }) id: string;
  @ApiProperty({ type: String }) targetType: TranslationTargetType;
  @ApiProperty({ type: String }) targetId: string;
  @ApiProperty({ type: String }) locale: string;
  @ApiProperty({ type: String }) sourceLocale: string;
  @ApiProperty({ type: String }) reviewStatus: TranslationReviewStatus;
  @ApiProperty({ type: String, nullable: true }) sourceText: string | null;
  @ApiProperty({ type: String, nullable: true }) translatedText: string | null;
  @ApiProperty({ type: String, nullable: true }) transcribeStatus: TranslationJobStatus | null;
  @ApiProperty({ type: String, nullable: true }) dubStatus: TranslationJobStatus | null;
  /** Signed/CDN URL to the WebVTT caption track, once published. */
  @ApiProperty({ type: String, nullable: true }) captionVttUrl: string | null;
  /** Signed/CDN URL to the dubbed-audio MP3 (Layer 2), once produced. */
  @ApiProperty({ type: String, nullable: true }) dubbedAudioUrl: string | null;
  @ApiProperty({ type: String, nullable: true }) reviewedAt: string | null;
  @ApiProperty({ type: String, nullable: true }) publishedAt: string | null;
  @ApiProperty({ type: String }) updatedAt: string;
}

/** Single-translation envelope (`{ data: {...} }`). */
export class TranslationResponse extends ItemResponse<TranslationDTO> {
  @ApiProperty({ type: TranslationDTO })
  declare data: TranslationDTO;
}

/** Collection envelope (`{ data: [...] }`) — a target's locales aren't paginated. */
export class TranslationListResponse extends ItemResponse<TranslationDTO[]> {
  @ApiProperty({ type: [TranslationDTO] })
  declare data: TranslationDTO[];
}
