import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuestionnaireStatus } from 'src/database/interfaces';

export class BodyPartResponseDTO {
  @ApiProperty()
  @IsString()
  part: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  severity?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class ResponseValueDTO {
  @ApiProperty({ description: 'Response type matching question type' })
  @IsString()
  type: string;

  @ApiPropertyOptional({ description: 'Single value (for single_choice, short_text, etc.)' })
  @IsString()
  @IsOptional()
  value?: string;

  @ApiPropertyOptional({ description: 'Multiple values (for multi_choice)', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  values?: string[];

  @ApiPropertyOptional({ description: 'Boolean value (for yes_no)' })
  @IsBoolean()
  @IsOptional()
  boolValue?: boolean;

  @ApiPropertyOptional({ description: 'Numeric value (for rating, slider, number, rpe)' })
  @IsNumber()
  @IsOptional()
  numValue?: number;

  @ApiPropertyOptional({ description: 'Body parts (for body_part type)', type: [BodyPartResponseDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BodyPartResponseDTO)
  @IsOptional()
  parts?: BodyPartResponseDTO[];
}

export class QuestionResponseDTO {
  @ApiProperty({ description: 'Question ID' })
  @IsUUID()
  questionId: string;

  @ApiProperty({ description: 'Response value' })
  @IsObject()
  @ValidateNested()
  @Type(() => ResponseValueDTO)
  response: ResponseValueDTO;
}

export class SaveResponsesBody {
  @ApiProperty({ description: 'Array of responses', type: [QuestionResponseDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionResponseDTO)
  responses: QuestionResponseDTO[];
}

export class InstanceIdParam {
  @ApiProperty({ description: 'Questionnaire instance ID' })
  @IsUUID()
  id: string;
}

export class ListMyQuestionnairesQuery {
  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: Object.values(QuestionnaireStatus),
  })
  @IsIn(Object.values(QuestionnaireStatus))
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Include only pending/in_progress', default: false })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  pendingOnly?: boolean;

  @ApiPropertyOptional({ description: 'Limit number of results' })
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset for pagination' })
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}
