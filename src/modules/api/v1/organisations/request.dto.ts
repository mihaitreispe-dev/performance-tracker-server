import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

import { OrganisationType } from 'src/database/interfaces';

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;

export class CreateOrganisationDto {
  @ApiProperty({ description: 'Display name of the organisation' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description: 'URL-safe slug (lowercase, hyphens). Auto-generated from name if omitted.',
  })
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  @Matches(SLUG_REGEX, { message: 'slug must be lowercase alphanumeric with hyphens' })
  slug?: string;

  @ApiPropertyOptional({
    enum: OrganisationType,
    description:
      "Signup track. Defaults to 'organisation' (multi-coach team with explicit org name + full Team surface). 'individual' = solo coach onboarding their own athletes, org name auto-generated, Team surface hidden.",
  })
  @IsOptional()
  @IsEnum(OrganisationType)
  orgType?: OrganisationType;
}

export class UpdateOrganisationDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  @Matches(SLUG_REGEX, { message: 'slug must be lowercase alphanumeric with hyphens' })
  slug?: string;

  /**
   * Opt in to general-population self-signup on the client-app subdomain.
   * 1:1 athletes (client_type='athlete') still require invitations regardless.
   */
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  allowsSelfSignup?: boolean;
}

export class SlugParam {
  @ApiProperty({ description: 'Organisation slug' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(SLUG_REGEX, { message: 'slug must be lowercase alphanumeric with hyphens' })
  slug: string;
}

export class OrganisationIdParam {
  @ApiProperty({ description: 'Organisation ID' })
  @IsUUID()
  id: string;
}

export class RequestLogoUploadDto {
  @ApiProperty({ description: 'Mime type of the logo image', example: 'image/png' })
  @IsString()
  @Matches(/^image\/(png|jpeg|svg\+xml|webp)$/, {
    message: 'mimeType must be image/png, image/jpeg, image/svg+xml or image/webp',
  })
  mimeType: string;
}

export class ConfirmLogoUploadDto {
  @ApiProperty()
  @IsString()
  bucket: string;

  @ApiProperty()
  @IsString()
  key: string;
}
