import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, IsObject, ValidateNested } from 'class-validator';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';

import { QuestionnaireInstanceDTO } from '../instances/response.dto';

export class AthleteQuestionnaireListResponse {
  @ApiProperty({ type: [QuestionnaireInstanceDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  data: QuestionnaireInstanceDTO[];

  @ApiProperty()
  @IsNumber()
  total: number;
}

export class AthleteQuestionnaireResponse extends ItemResponse<QuestionnaireInstanceDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: QuestionnaireInstanceDTO;
}

export class SubmitResultDTO {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  completedAt: string;
}

export class SubmitResponse extends ItemResponse<SubmitResultDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: SubmitResultDTO;
}
