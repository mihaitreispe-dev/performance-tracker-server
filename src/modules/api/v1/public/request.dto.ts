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
}

export class ResourceIdParam {
  @IsUUID()
  id: string;
}
