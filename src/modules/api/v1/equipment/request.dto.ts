import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateEquipmentBody {
  @ApiProperty({ description: 'Equipment name (idempotent — reuses an existing match).' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;
}
