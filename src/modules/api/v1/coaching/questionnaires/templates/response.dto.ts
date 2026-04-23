import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { QuestionnaireCategory, QuestionType } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';

export class QuestionConfigResponseDTO {
  @ApiPropertyOptional({ description: 'Options for choice questions' })
  options?: { value: string; label: string }[];

  @ApiPropertyOptional()
  min?: number;

  @ApiPropertyOptional()
  max?: number;

  @ApiPropertyOptional()
  step?: number;

  @ApiPropertyOptional()
  minLabel?: string;

  @ApiPropertyOptional()
  maxLabel?: string;

  @ApiPropertyOptional()
  unit?: string;

  @ApiPropertyOptional()
  placeholder?: string;

  @ApiPropertyOptional()
  maxLength?: number;

  @ApiPropertyOptional()
  rows?: number;

  @ApiPropertyOptional()
  yesLabel?: string;

  @ApiPropertyOptional()
  noLabel?: string;

  @ApiPropertyOptional()
  minDate?: string;

  @ApiPropertyOptional()
  maxDate?: string;

  @ApiPropertyOptional()
  allowFuture?: boolean;

  @ApiPropertyOptional()
  allowPast?: boolean;

  @ApiPropertyOptional()
  allowMultiple?: boolean;

  @ApiPropertyOptional()
  availableParts?: string[];

  @ApiPropertyOptional()
  scale?: '1-10' | '6-20';

  @ApiPropertyOptional()
  showDescriptions?: boolean;

  @ApiPropertyOptional()
  minSelections?: number;

  @ApiPropertyOptional()
  maxSelections?: number;

  @ApiPropertyOptional()
  moodOptions?: { value: string; emoji: string; label: string }[];
}

export class QuestionDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  templateId: string;

  @ApiProperty()
  @IsString()
  questionText: string;

  @ApiProperty({ enum: Object.values(QuestionType) })
  @IsIn(Object.values(QuestionType))
  questionType: string;

  @ApiProperty()
  @IsBoolean()
  isRequired: boolean;

  @ApiProperty()
  @IsNumber()
  orderIndex: number;

  @ApiPropertyOptional({ type: QuestionConfigResponseDTO })
  @IsObject()
  @IsOptional()
  config?: QuestionConfigResponseDTO | null;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class QuestionnaireTemplateDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  coachId: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  description?: string | null;

  @ApiProperty({ enum: Object.values(QuestionnaireCategory) })
  @IsIn(Object.values(QuestionnaireCategory))
  category: string;

  @ApiProperty()
  @IsBoolean()
  isArchived: boolean;

  @ApiPropertyOptional({ type: [QuestionDTO], description: 'Questions (included when fetching single template)' })
  @IsArray()
  @ValidateNested({ each: true })
  @IsOptional()
  questions?: QuestionDTO[];

  @ApiPropertyOptional({ description: 'Number of questions in this template' })
  @IsNumber()
  @IsOptional()
  questionCount?: number;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class QuestionnaireTemplateResponse extends ItemResponse<QuestionnaireTemplateDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: QuestionnaireTemplateDTO;
}

export class QuestionnaireTemplateListResponse {
  @ApiProperty({ type: [QuestionnaireTemplateDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  data: QuestionnaireTemplateDTO[];

  @ApiProperty()
  @IsNumber()
  total: number;
}

export class QuestionResponse extends ItemResponse<QuestionDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: QuestionDTO;
}
