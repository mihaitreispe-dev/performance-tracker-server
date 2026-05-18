import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ThemeDTO {
  @ApiProperty()
  organisationId: string;

  @ApiProperty({ description: 'Theme tokens map. Empty object if no theme set.' })
  themeTokens: Record<string, string>;

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
