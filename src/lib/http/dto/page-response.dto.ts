import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsObject, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

export class PageLinks {
  @ApiPropertyOptional({
    type: String,
    description: 'URL of the next page. Missing if there is no next page.',
    example: 'https://api.younison.com/resource/next-page-link',
  })
  @IsString({ always: true })
  @IsOptional()
  @MinLength(1)
  next?: string;
}

/**
 * Array response envelope. All array responses need to be wrapped by this.
 * */
export class PageResponse<TItem> {
  constructor(params: { data: TItem[]; links: PageLinks }) {
    this.data = params.data;
    this.links = params.links;
  }

  @IsArray({ always: true })
  @ValidateNested()
  // Add OpenAPI info to subclasses, since it can't infer the generic TItem type
  data: TItem[];

  @ApiPropertyOptional({ description: 'Pagination links' })
  @IsObject({ always: true })
  @ValidateNested()
  @Type(() => PageLinks)
  @IsOptional()
  links?: PageLinks;

  @ApiPropertyOptional({
    type: Number,
  })
  @IsNumber()
  @IsOptional()
  offset?: number;

  @ApiPropertyOptional({
    type: Number,
  })
  @IsNumber()
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Total number of items returned by the request, with no pagination limit applied',
  })
  @IsNumber()
  @IsOptional()
  totalCount?: number;
}
