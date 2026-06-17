import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
