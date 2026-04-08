import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuestionnaireStatus } from 'src/database/interfaces';

import { CreateQuestionDTO } from '../templates/request.dto';

export class SendQuestionnaireToAthleteBody {
  @ApiProperty({ description: 'Template ID to send' })
  @IsUUID()
  templateId: string;

  @ApiPropertyOptional({ description: 'Optional message to accompany the questionnaire' })
  @IsString()
  @IsOptional()
  message?: string;

  @ApiPropertyOptional({ description: 'Expiry date for the questionnaire (ISO string)' })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

export class SendQuestionnaireToMultipleBody {
  @ApiProperty({ description: 'Athlete IDs to send to', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  athleteIds: string[];

  @ApiPropertyOptional({ description: 'Optional message to accompany the questionnaire' })
  @IsString()
  @IsOptional()
  message?: string;

  @ApiPropertyOptional({ description: 'Expiry date for the questionnaire (ISO string)' })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

export class QuickCreateAndSendBody {
  @ApiProperty({ description: 'Questionnaire name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Questionnaire description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Questions to include', type: [CreateQuestionDTO] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDTO)
  questions: CreateQuestionDTO[];

  @ApiPropertyOptional({ description: 'Optional message to accompany the questionnaire' })
  @IsString()
  @IsOptional()
  message?: string;

  @ApiPropertyOptional({ description: 'Expiry date for the questionnaire (ISO string)' })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Save as template for future use', default: false })
  @IsOptional()
  saveAsTemplate?: boolean;
}

export class AthleteIdParam {
  @ApiProperty({ description: 'Athlete ID' })
  @IsUUID()
  athleteId: string;
}

export class InstanceIdParam {
  @ApiProperty({ description: 'Instance ID' })
  @IsUUID()
  id: string;
}

export class TemplateIdWithAthleteParam {
  @ApiProperty({ description: 'Template ID' })
  @IsUUID()
  id: string;
}

export class ListAthleteQuestionnairesQuery {
  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: Object.values(QuestionnaireStatus),
  })
  @IsIn(Object.values(QuestionnaireStatus))
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by template ID' })
  @IsUUID()
  @IsOptional()
  templateId?: string;

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

export class CompareQuestionnairesQuery {
  @ApiProperty({ description: 'Template ID to compare instances of' })
  @IsUUID()
  templateId: string;

  @ApiPropertyOptional({ description: 'Limit number of instances to compare' })
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(2)
  @IsOptional()
  limit?: number;
}
