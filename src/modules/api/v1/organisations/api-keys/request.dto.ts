import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { API_KEY_BANDS } from 'src/modules/auth/api-key/api-key.util';
import type { ApiKeyBand } from 'src/modules/auth/api-key/api-key.util';
import { API_KEY_SCOPES } from 'src/modules/auth/api-key/api-key.scopes';
import type { ApiKeyScope } from 'src/modules/auth/api-key/api-key.scopes';

export class CreateApiKeyDto {
  @ApiProperty({ description: 'Human-readable label shown to org admins' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiProperty({
    enum: API_KEY_BANDS,
    default: 'live',
    description: '`live` for production traffic, `test` for non-billed staging traffic.',
  })
  @IsIn(API_KEY_BANDS as unknown as string[])
  band: ApiKeyBand;

  @ApiProperty({
    enum: API_KEY_SCOPES,
    isArray: true,
    description: 'Permissions this key holds. Must be a non-empty subset of the scope catalogue.',
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(API_KEY_SCOPES.length)
  @IsIn(API_KEY_SCOPES as unknown as string[], { each: true })
  scopes: ApiKeyScope[];

  @ApiPropertyOptional({ description: 'ISO timestamp. Key is rejected after this point.' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Allow-list of redirect URIs the hosted auth page may bounce users to. Required for the Phase 4 code-grant flow; ignored otherwise.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  redirectUris?: string[];

  @ApiPropertyOptional({
    description:
      'Mark this key as a public client (browser SPA / mobile / native). Public keys skip the bcrypt secret check on /v1/public/auth/token and require PKCE instead. Default false — keeps the private integrator-backend flow.',
  })
  @IsOptional()
  @IsBoolean()
  isPublicClient?: boolean;
}

export class ApiKeyIdParams {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  keyId: string;
}
