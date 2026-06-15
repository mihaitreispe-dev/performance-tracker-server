import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsUUID } from 'class-validator';

export class EquipmentDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;
}

export class EquipmentListResponse {
  @ApiProperty({ type: [EquipmentDTO] })
  @IsArray()
  data: EquipmentDTO[];
}
