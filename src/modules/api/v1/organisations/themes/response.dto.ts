import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ThemeDTO {
  @ApiProperty()
  organisationId: string;

  @ApiProperty({ description: 'Light-mode theme tokens. Empty object if no theme set.' })
  themeTokens: Record<string, string>;

  @ApiProperty({
    description:
      'Dark-mode theme tokens. Same keys as themeTokens. Empty object means "fall back to the base MUI dark palette".',
  })
  themeTokensDark: Record<string, string>;

  @ApiProperty({ description: 'Copy override map. Empty object if none set.' })
  copyOverrides: Record<string, string>;

  @ApiPropertyOptional({ nullable: true })
  fontFamily: string | null;

  @ApiPropertyOptional({ nullable: true })
  faviconUrl: string | null;
}

export class ThemeResponse {
  @ApiProperty({ type: ThemeDTO })
  data: ThemeDTO;
}

export class FaviconUploadDTO {
  @ApiProperty({ description: 'Presigned PUT URL valid for 1 hour' })
  uploadUrl: string;

  @ApiProperty()
  bucket: string;

  @ApiProperty()
  key: string;
}

export class FaviconUploadResponse {
  @ApiProperty({ type: FaviconUploadDTO })
  data: FaviconUploadDTO;
}
