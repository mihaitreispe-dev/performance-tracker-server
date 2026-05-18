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

  @ApiPropertyOptional({ nullable: true })
  thumbnailUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  durationSeconds: number | null;

  @ApiProperty({ enum: ContentItemStatus })
  status: ContentItemStatus;

  @ApiProperty({ type: [String] })
  tags: string[];

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
}

export class CreateContentItemResponse {
  @ApiProperty({ type: ContentItemWithUploadDTO })
  data: ContentItemWithUploadDTO;
}
