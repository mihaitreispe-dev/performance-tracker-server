import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuestionnaireCategory, QuestionType } from 'src/database/interfaces';

// Question configuration DTOs
export class OptionDTO {
  @ApiProperty()
  @IsString()
  value: string;

  @ApiProperty()
  @IsString()
  label: string;
}

export class MoodOptionDTO {
  @ApiProperty()
  @IsString()
  value: string;

  @ApiProperty()
  @IsString()
  emoji: string;

  @ApiProperty()
  @IsString()
  label: string;
}

export class QuestionConfigDTO {
  @ApiPropertyOptional({ type: [OptionDTO], description: 'Options for choice questions' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionDTO)
  @IsOptional()
  options?: OptionDTO[];

  @ApiPropertyOptional({ description: 'Minimum value/selections' })
  @IsNumber()
  @IsOptional()
  min?: number;

  @ApiPropertyOptional({ description: 'Maximum value/selections' })
  @IsNumber()
  @IsOptional()
  max?: number;

  @ApiPropertyOptional({ description: 'Step increment for sliders/numbers' })
  @IsNumber()
  @IsOptional()
  step?: number;

  @ApiPropertyOptional({ description: 'Label for minimum value' })
  @IsString()
  @IsOptional()
  minLabel?: string;

  @ApiPropertyOptional({ description: 'Label for maximum value' })
  @IsString()
  @IsOptional()
  maxLabel?: string;

  @ApiPropertyOptional({ description: 'Unit label (e.g., "kg", "%")' })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional({ description: 'Placeholder text' })
  @IsString()
  @IsOptional()
  placeholder?: string;

  @ApiPropertyOptional({ description: 'Maximum text length' })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxLength?: number;

  @ApiPropertyOptional({ description: 'Number of rows for textarea' })
  @IsInt()
  @Min(1)
  @IsOptional()
  rows?: number;

  @ApiPropertyOptional({ description: 'Custom yes label' })
  @IsString()
  @IsOptional()
  yesLabel?: string;

  @ApiPropertyOptional({ description: 'Custom no label' })
  @IsString()
  @IsOptional()
  noLabel?: string;

  @ApiPropertyOptional({ description: 'Minimum date (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  minDate?: string;

  @ApiPropertyOptional({ description: 'Maximum date (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  maxDate?: string;

  @ApiPropertyOptional({ description: 'Allow future dates' })
  @IsBoolean()
  @IsOptional()
  allowFuture?: boolean;

  @ApiPropertyOptional({ description: 'Allow past dates' })
  @IsBoolean()
  @IsOptional()
  allowPast?: boolean;

  @ApiPropertyOptional({ description: 'Allow multiple body parts' })
  @IsBoolean()
  @IsOptional()
  allowMultiple?: boolean;

  @ApiPropertyOptional({ description: 'Available body parts', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  availableParts?: string[];

  @ApiPropertyOptional({ description: 'RPE scale type', enum: ['1-10', '6-20'] })
  @IsIn(['1-10', '6-20'])
  @IsOptional()
  scale?: '1-10' | '6-20';

  @ApiPropertyOptional({ description: 'Show RPE descriptions' })
  @IsBoolean()
  @IsOptional()
  showDescriptions?: boolean;

  @ApiPropertyOptional({ description: 'Minimum selections (for multi-choice)' })
  @IsInt()
  @Min(0)
  @IsOptional()
  minSelections?: number;

  @ApiPropertyOptional({ description: 'Maximum selections (for multi-choice)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxSelections?: number;

  @ApiPropertyOptional({ type: [MoodOptionDTO], description: 'Mood options' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MoodOptionDTO)
  @IsOptional()
  moodOptions?: MoodOptionDTO[];
}

export class CreateQuestionDTO {
  @ApiProperty({ description: 'Question text' })
  @IsString()
  @MaxLength(1000)
  questionText: string;

  @ApiProperty({
    description: 'Question type',
    enum: Object.values(QuestionType),
  })
  @IsIn(Object.values(QuestionType))
  questionType: string;

  @ApiPropertyOptional({ description: 'Whether the question is required', default: true })
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @ApiPropertyOptional({ description: 'Question configuration' })
  @IsObject()
  @ValidateNested()
  @Type(() => QuestionConfigDTO)
  @IsOptional()
  config?: QuestionConfigDTO;
}

export class CreateQuestionnaireTemplateBody {
  @ApiProperty({ description: 'Template name' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Template description' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Template category',
    enum: Object.values(QuestionnaireCategory),
    default: QuestionnaireCategory.CUSTOM,
  })
  @IsIn(Object.values(QuestionnaireCategory))
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Initial questions', type: [CreateQuestionDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDTO)
  @IsOptional()
  questions?: CreateQuestionDTO[];
}

export class UpdateQuestionnaireTemplateBody {
  @ApiPropertyOptional({ description: 'Template name' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Template description' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string | null;

  @ApiPropertyOptional({
    description: 'Template category',
    enum: Object.values(QuestionnaireCategory),
  })
  @IsIn(Object.values(QuestionnaireCategory))
  @IsOptional()
  category?: string;
}

export class AddQuestionBody {
  @ApiProperty({ description: 'Question text' })
  @IsString()
  @MaxLength(1000)
  questionText: string;

  @ApiProperty({
    description: 'Question type',
    enum: Object.values(QuestionType),
  })
  @IsIn(Object.values(QuestionType))
  questionType: string;

  @ApiPropertyOptional({ description: 'Whether the question is required', default: true })
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @ApiPropertyOptional({ description: 'Order index (defaults to end of list)' })
  @IsInt()
  @Min(0)
  @IsOptional()
  orderIndex?: number;

  @ApiPropertyOptional({ description: 'Question configuration' })
  @IsObject()
  @ValidateNested()
  @Type(() => QuestionConfigDTO)
  @IsOptional()
  config?: QuestionConfigDTO;
}

export class UpdateQuestionBody {
  @ApiPropertyOptional({ description: 'Question text' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  questionText?: string;

  @ApiPropertyOptional({
    description: 'Question type',
    enum: Object.values(QuestionType),
  })
  @IsIn(Object.values(QuestionType))
  @IsOptional()
  questionType?: string;

  @ApiPropertyOptional({ description: 'Whether the question is required' })
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @ApiPropertyOptional({ description: 'Question configuration' })
  @IsObject()
  @ValidateNested()
  @Type(() => QuestionConfigDTO)
  @IsOptional()
  config?: QuestionConfigDTO | null;
}

export class ReorderQuestionsBody {
  @ApiProperty({
    description: 'Array of question IDs in new order',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  questionIds: string[];
}

export class TemplateIdParam {
  @ApiProperty({ description: 'Template ID' })
  @IsUUID()
  id: string;
}

export class QuestionIdParam {
  @ApiProperty({ description: 'Template ID' })
  @IsUUID()
  id: string;

  @ApiProperty({ description: 'Question ID' })
  @IsUUID()
  questionId: string;
}

export class ListTemplatesQuery {
  @ApiPropertyOptional({
    description: 'Filter by category',
    enum: Object.values(QuestionnaireCategory),
  })
  @IsIn(Object.values(QuestionnaireCategory))
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Include archived templates' })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  includeArchived?: boolean;

  @ApiPropertyOptional({ description: 'Search by name or description' })
  @IsString()
  @IsOptional()
  search?: string;

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
