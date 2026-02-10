import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { CardioSportType } from 'src/database/interfaces';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

export class CardioCategoryDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty({ enum: CardioSportType })
  @IsEnumString(CardioSportType)
  sportType: CardioSportType;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: String })
  @IsUUID()
  @IsOptional()
  userId?: string | null;

  @ApiProperty()
  @IsString()
  createdAt: string;
}

export class CardioCategoryResponse {
  @ApiProperty({ type: CardioCategoryDTO })
  @ValidateNested()
  data: CardioCategoryDTO;
}

export class CardioCategoryListResponse {
  @ApiProperty({ type: [CardioCategoryDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  data: CardioCategoryDTO[];
}
