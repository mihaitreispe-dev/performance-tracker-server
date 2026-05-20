import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { ClientType } from 'src/database/interfaces';

export class CreatePublicClientBody {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description: 'Defaults to the local part of the email if omitted.',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Arbitrary external profile data stored per-(user, org). Merged shallowly with any existing metadata on repeat calls.',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    enum: ClientType,
    description:
      "Sub-track for this client: 'general' (default — one-to-many content consumer) or 'athlete' (one-to-one full coaching). On first creation the org's per-type default module profile is applied. Ignored on subsequent upserts.",
  })
  @IsOptional()
  @IsEnum(ClientType)
  clientType?: ClientType;
}

export class ListPublicClientsQuery {
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({
    description:
      'Filter by external metadata equality. Pass either a JSON object or a comma-separated `key=value` list (?metadata=crmId%3Dabc123).',
  })
  @IsOptional()
  metadata?: string | Record<string, unknown>;
}

export class PublicClientIdParam {
  @IsUUID()
  id: string;
}
