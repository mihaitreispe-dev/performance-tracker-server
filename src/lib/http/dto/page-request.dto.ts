import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class PageQuery {
  @ApiPropertyOptional({ type: Number })
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 0 })
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  offset?: number;

  @ApiPropertyOptional({ type: Number, description: 'Number of items to return' })
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 0 })
  @Min(1)
  @Max(50)
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

export class SearchableQuery extends PageQuery {
  @ApiPropertyOptional({ type: String, description: 'Search text' })
  @IsString({ always: true })
  @IsOptional()
  q?: string;
}
