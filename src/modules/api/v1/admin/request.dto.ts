import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ImpersonateDto {
  @ApiProperty({ description: 'User id to impersonate.' })
  @IsUUID()
  userId: string;
}

export class AdminUserSearchQuery {
  @ApiPropertyOptional({
    description: 'Case-insensitive substring matched against email + display name + first/last name.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  q?: string;
}

export class AdminOrgIdParam {
  @ApiProperty({ description: 'Organisation id.' })
  @IsUUID()
  id: string;
}

export class AdminActivityQuery {
  @ApiPropertyOptional({ description: 'Range start (ISO). Default: 30 days ago.' })
  @IsString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'Range end (ISO). Default: now.' })
  @IsString()
  @IsOptional()
  to?: string;
}

export class AdminApiKeyIdParam {
  @ApiProperty({ description: 'API key id.' })
  @IsUUID()
  id: string;
}

export class IssueApiKeyBody {
  @ApiProperty({ description: 'Human label for the key ("Production", "Mobile app").' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ enum: ['live', 'test'], description: 'Key band. Default "live".' })
  @IsIn(['live', 'test'])
  @IsOptional()
  band?: 'live' | 'test';

  @ApiPropertyOptional({ type: [String], description: 'Permission scopes for /v1/public/*.' })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  @IsOptional()
  scopes?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Allowed OAuth redirect URIs (public clients).' })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @IsOptional()
  redirectUris?: string[];

  @ApiPropertyOptional({ description: 'Public client (SPA/mobile) → PKCE instead of secret. Default false.' })
  @IsBoolean()
  @IsOptional()
  isPublicClient?: boolean;
}

// ---- Onboarding -------------------------------------------------------------

export class OnboardModuleDTO {
  @ApiProperty({ description: 'Module key (e.g. workouts, courses).' })
  @IsString()
  key: string;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

export class OnboardThemeDTO {
  @ApiPropertyOptional({ type: Object, description: 'Light-mode theme tokens (token → value).' })
  @IsObject()
  @IsOptional()
  themeTokens?: Record<string, string>;

  @ApiPropertyOptional({ type: Object, description: 'Dark-mode theme tokens.' })
  @IsObject()
  @IsOptional()
  themeTokensDark?: Record<string, string>;

  @ApiPropertyOptional({ type: Object, description: 'Copy overrides (key → text).' })
  @IsObject()
  @IsOptional()
  copyOverrides?: Record<string, string>;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  fontFamily?: string;
}

export class OnboardApiKeyDTO extends IssueApiKeyBody {}

export class OnboardOrganisationBody {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiProperty({ description: 'URL-safe identifier; must be unique.' })
  @IsString()
  @MaxLength(80)
  slug: string;

  @ApiPropertyOptional({ enum: ['organisation', 'individual'] })
  @IsIn(['organisation', 'individual'])
  @IsOptional()
  orgType?: 'organisation' | 'individual';

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  allowsSelfSignup?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  usesExternalApp?: boolean;

  @ApiPropertyOptional({ type: [OnboardModuleDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardModuleDTO)
  @IsOptional()
  modules?: OnboardModuleDTO[];

  @ApiPropertyOptional({ type: OnboardThemeDTO })
  @ValidateNested()
  @Type(() => OnboardThemeDTO)
  @IsOptional()
  theme?: OnboardThemeDTO;

  @ApiPropertyOptional({ description: 'Email of an existing user to set as OWNER.' })
  @IsEmail()
  @IsOptional()
  ownerEmail?: string;

  @ApiPropertyOptional({ type: OnboardApiKeyDTO, description: 'Issue a first API key during onboarding.' })
  @ValidateNested()
  @Type(() => OnboardApiKeyDTO)
  @IsOptional()
  apiKey?: OnboardApiKeyDTO;
}
