import { ApiProperty } from '@nestjs/swagger';

export class InlineImageUploadSlotDTO {
  @ApiProperty({ description: 'Row id; also part of the stable viewUrl.' })
  id: string;

  @ApiProperty({ description: 'Presigned PUT URL to stream the image to.' })
  uploadUrl: string;

  @ApiProperty({
    description:
      'Stable URL the client embeds as <img src=...>. Resolves via a server redirect that signs ' +
      'a fresh S3 GET each time, so the link in stored HTML keeps working past S3 expiry.',
  })
  viewUrl: string;

  @ApiProperty()
  bucket: string;

  @ApiProperty()
  key: string;
}

export class RequestInlineImageUploadResponse {
  @ApiProperty({ type: InlineImageUploadSlotDTO })
  data: InlineImageUploadSlotDTO;
}
