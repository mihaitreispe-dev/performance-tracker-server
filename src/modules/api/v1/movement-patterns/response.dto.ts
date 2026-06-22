import { ApiProperty } from '@nestjs/swagger';

export class MovementPatternDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class MovementPatternListResponse {
  @ApiProperty({ type: [MovementPatternDTO] })
  data: MovementPatternDTO[];
}
