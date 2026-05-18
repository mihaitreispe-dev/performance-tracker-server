import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateThemeDto {
  @ApiPropertyOptional({
    description: 'Theme tokens map (color names → hex/rgb strings). Replaces stored value if provided.',
    example: { primary: '#ff6b35', secondary: '#004e89', background: '#ffffff' },
  })
  @IsObject()
  @IsOptional()
  themeTokens?: Record<string, string>;

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
