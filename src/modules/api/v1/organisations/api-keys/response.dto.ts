import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiKeyDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  organisationId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ description: 'Visible prefix (e.g. "sz_live_a1b2c3d4"). Safe to display.' })
  keyPrefix: string;

  @ApiProperty({ isArray: true, type: String })
  scopes: string[];

  @ApiPropertyOptional({ nullable: true })
  lastUsedAt: string | null;

  @ApiPropertyOptional({ nullable: true })
  revokedAt: string | null;

  @ApiPropertyOptional({ nullable: true })
  expiresAt: string | null;

  @ApiProperty()
  createdByUserId: string;

  @ApiProperty()
  createdAt: string;
}

export class CreatedApiKeyDTO extends ApiKeyDTO {
  @ApiProperty({
    description:
      'The full key — copy it now, it will never be shown again. Pass as `Authorization: Bearer <fullKey>` or `X-API-Key`.',
  })
  fullKey: string;
}

export class ApiKeyResponse {
  @ApiProperty({ type: ApiKeyDTO })
  data: ApiKeyDTO;
}

export class CreatedApiKeyResponse {
  @ApiProperty({ type: CreatedApiKeyDTO })
  data: CreatedApiKeyDTO;
}

export class ApiKeyListResponse {
  @ApiProperty({ type: [ApiKeyDTO] })
  data: ApiKeyDTO[];
}

export class ApiKeyUsageDailyDTO {
  @ApiProperty()
  date: string;

  @ApiProperty()
  endpoint: string;

  @ApiProperty()
  requestCount: number;

  @ApiProperty()
  errorCount: number;

  @ApiPropertyOptional({ nullable: true })
  p95ResponseMs: number | null;
}

export class ApiKeyUsageResponse {
  @ApiProperty({ type: [ApiKeyUsageDailyDTO] })
  data: ApiKeyUsageDailyDTO[];
}
