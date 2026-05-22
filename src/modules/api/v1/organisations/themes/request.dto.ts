import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateThemeDto {
  @ApiPropertyOptional({
    description:
      'Light-mode theme tokens (color names → hex/rgb). Replaces stored value if provided.',
    example: { primary: '#ff6b35', secondary: '#004e89', background: '#ffffff' },
  })
  @IsObject()
  @IsOptional()
  themeTokens?: Record<string, string>;

  @ApiPropertyOptional({
    description:
      'Dark-mode theme tokens (color names → hex/rgb). Same keys as themeTokens, applied when the user is in dark mode. Empty map / omitted means "fall back to the base dark theme" for this org.',
    example: { primary: '#9aa3ff', secondary: '#22c1c3', background: '#0e1117' },
  })
  @IsObject()
  @IsOptional()
  themeTokensDark?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Copy override map (key → replacement string). Replaces stored value if provided.',
    example: { athletes: 'clients', welcome: 'Welcome to FastClub' },
  })
  @IsObject()
  @IsOptional()
  copyOverrides?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Font family CSS string' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  fontFamily?: string | null;
}

export class RequestFaviconUploadDto {
  @ApiProperty({ description: 'Mime type of the favicon image', example: 'image/png' })
  @IsString()
  @Matches(/^image\/(png|svg\+xml|x-icon|vnd\.microsoft\.icon)$/, {
    message: 'mimeType must be image/png, image/svg+xml or image/x-icon',
  })
  mimeType: string;
}

export class ConfirmFaviconUploadDto {
  @ApiProperty()
  @IsString()
  bucket: string;

  @ApiProperty()
  @IsString()
  key: string;
}
