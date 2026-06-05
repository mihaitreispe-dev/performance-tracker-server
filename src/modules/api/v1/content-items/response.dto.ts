import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentItemKind, ContentItemStatus } from 'src/database/interfaces';

export class ContentItemDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  organisationId: string;

  @ApiProperty({ enum: ContentItemKind })
  kind: ContentItemKind;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ nullable: true })
  ownerUserId: string | null;

  @ApiPropertyOptional({ nullable: true })
  videoUrl: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      '9:16 portrait companion of videoUrl, signed read URL. Populated some time ' +
      'after upload by the transcode pipeline; null until then. Phone-portrait viewers ' +
      'prefer this asset over videoUrl; everyone else uses videoUrl (16:9).',
  })
  videoPortraitUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  thumbnailUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  durationSeconds: number | null;

  @ApiProperty({ enum: ContentItemStatus })
  status: ContentItemStatus;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiPropertyOptional({ nullable: true, type: String })
  featuredFrom: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  featuredUntil: string | null;

  @ApiProperty({
    description:
      'True when this resource has at least one configured entitlement requirement AND the caller does not hold any product that unlocks it. False when the resource is free (no entitlements configured) OR the caller has already unlocked it. Computed server-side per-caller; do not rely on this field for authoring callers since it reflects the requester\'s own entitlements.',
  })
  locked: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class ContentItemResponse {
  @ApiProperty({ type: ContentItemDTO })
  data: ContentItemDTO;
}

export class ContentItemsListResponse {
  @ApiProperty({ type: [ContentItemDTO] })
  data: ContentItemDTO[];
}

export class ContentItemWithUploadDTO extends ContentItemDTO {
  @ApiPropertyOptional({
    nullable: true,
    description: 'Presigned PUT URL for the video upload. Null if no videoMimeType was supplied.',
  })
  uploadUrl: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Presigned PUT URL for an image/jpeg poster frame captured client-side. Best-effort: " +
      'omit and the row stays thumbnail-less; the card UI falls back to a placeholder. ' +
      "Pinned at create time so the thumbnail can be uploaded in parallel with the video. " +
      'Null if no videoMimeType was supplied (no upload slot).',
  })
  thumbnailUploadUrl: string | null;
}

export class CreateContentItemResponse {
  @ApiProperty({ type: ContentItemWithUploadDTO })
  data: ContentItemWithUploadDTO;
}
