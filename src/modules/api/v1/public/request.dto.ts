import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class PublicPaginationQuery {
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
}

export class PublicSearchQuery extends PublicPaginationQuery {
  @ApiPropertyOptional({ description: 'Substring match on the resource name/title.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Tag filter (movement snacks only).' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      "User id of the consuming client. When provided, the response's `lock.locked` flag reflects whether THIS client has an active subscription unlocking the resource. Omitted = lock metadata reflects \"is this resource gated\" only.",
  })
  @IsOptional()
  @IsUUID()
  clientId?: string;
}

export class ResourceIdParam {
  @IsUUID()
  id: string;
}

/**
 * Same shape as the list query's clientId — extracted into its own DTO
 * so detail endpoints don't carry the unused pagination fields.
 */
export class PublicClientContextQuery {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'User id of the consuming client. When provided, locked resources return HTTP 402 with a tier payload instead of the resource body. Omit to browse the catalogue without enforcement (the `lock` field on the response still indicates whether the resource is gated).',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string;
}
