import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { QuestionnaireStatus, ResponseValue } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';

import { QuestionDTO } from '../templates/response.dto';

export class UserBasicDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  email: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  displayName?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  firstName?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  lastName?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  picture?: string | null;
}

export class QuestionnaireResponseDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  questionId: string;

  @ApiProperty({ description: 'Snapshot of the question at response time' })
  @IsObject()
  questionSnapshot: QuestionDTO;

  @ApiPropertyOptional({ description: 'The response value' })
  @IsObject()
  @IsOptional()
  responseValue?: ResponseValue;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class TemplateSnapshotDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  description?: string | null;

  @ApiProperty()
  @IsString()
  category: string;

  @ApiProperty({ type: [QuestionDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  questions: QuestionDTO[];
}

export class QuestionnaireInstanceDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiPropertyOptional({ type: String, description: 'Original template ID (may be null if template was deleted)' })
  @IsUUID()
  @IsOptional()
  templateId?: string | null;

  @ApiProperty()
  @IsUUID()
  relationshipId: string;

  @ApiProperty()
  @IsUUID()
  coachId: string;

  @ApiPropertyOptional({ description: 'Coach details' })
  @IsObject()
  @IsOptional()
  coach?: UserBasicDTO;

  @ApiProperty()
  @IsUUID()
  athleteId: string;

  @ApiPropertyOptional({ description: 'Athlete details' })
  @IsObject()
  @IsOptional()
  athlete?: UserBasicDTO;

  @ApiPropertyOptional({ type: String })
  @IsUUID()
  @IsOptional()
  messageId?: string | null;

  @ApiProperty({ enum: Object.values(QuestionnaireStatus) })
  @IsIn(Object.values(QuestionnaireStatus))
  status: string;

  @ApiProperty()
  @IsString()
  sentAt: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  startedAt?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  completedAt?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  expiresAt?: string | null;

  @ApiProperty({ description: 'Snapshot of the template at send time' })
  @IsObject()
  templateSnapshot: TemplateSnapshotDTO;

  @ApiPropertyOptional({ type: [QuestionnaireResponseDTO], description: 'Responses (included when fetching single instance)' })
  @IsArray()
  @ValidateNested({ each: true })
  @IsOptional()
  responses?: QuestionnaireResponseDTO[];

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class QuestionnaireInstanceResponse extends ItemResponse<QuestionnaireInstanceDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: QuestionnaireInstanceDTO;
}

export class QuestionnaireInstanceListResponse {
  @ApiProperty({ type: [QuestionnaireInstanceDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  data: QuestionnaireInstanceDTO[];

  @ApiProperty()
  @IsNumber()
  total: number;
}

export class SendQuestionnaireResultDTO {
  @ApiProperty({ description: 'Number of questionnaires sent' })
  @IsNumber()
  sent: number;

  @ApiProperty({ description: 'Instance IDs created' })
  @IsArray()
  @IsUUID('4', { each: true })
  instanceIds: string[];

  @ApiPropertyOptional({ description: 'Template ID (if saved as template)' })
  @IsUUID()
  @IsOptional()
  templateId?: string;
}

export class SendQuestionnaireResponse extends ItemResponse<SendQuestionnaireResultDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: SendQuestionnaireResultDTO;
}

export class ComparisonResponseDTO {
  @ApiProperty()
  @IsUUID()
  questionId: string;

  @ApiProperty()
  @IsString()
  questionText: string;

  @ApiProperty()
  @IsString()
  questionType: string;

  @ApiProperty({ description: 'Responses for each instance, keyed by instance ID' })
  @IsObject()
  instanceResponses: Record<string, ResponseValue>;
}

export class CompareQuestionnairesDTO {
  @ApiProperty({ description: 'Template information' })
  @IsObject()
  template: {
    id: string;
    name: string;
  };

  @ApiProperty({ type: [QuestionnaireInstanceDTO], description: 'Instances being compared (in chronological order)' })
  @IsArray()
  instances: QuestionnaireInstanceDTO[];

  @ApiProperty({ type: [ComparisonResponseDTO], description: 'Responses grouped by question' })
  @IsArray()
  comparisons: ComparisonResponseDTO[];
}

export class CompareQuestionnairesResponse extends ItemResponse<CompareQuestionnairesDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: CompareQuestionnairesDTO;
}
