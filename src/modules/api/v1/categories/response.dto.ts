import { ApiProperty } from '@nestjs/swagger';

export class CategoryDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class CategoryListResponse {
  @ApiProperty({ type: [CategoryDTO] })
  data: CategoryDTO[];
}
