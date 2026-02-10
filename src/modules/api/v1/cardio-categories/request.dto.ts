import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { CardioSportType } from 'src/database/interfaces';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

export class ListCardioCategoriesQuery {
  @ApiPropertyOptional({ enum: CardioSportType, description: 'Filter by sport type' })
  @IsEnumString(CardioSportType)
  @IsOptional()
  sportType?: CardioSportType;
}

export class CreateCardioCategoryBody {
  @ApiProperty({ enum: CardioSportType, description: 'Sport type' })
  @IsEnumString(CardioSportType)
  sportType: CardioSportType;

  @ApiProperty({ description: 'Category name' })
  @IsString()
  name: string;
}

export class CardioCategoryIdParam {
  @ApiProperty({ description: 'Cardio category ID' })
  @IsUUID()
  id: string;
}
