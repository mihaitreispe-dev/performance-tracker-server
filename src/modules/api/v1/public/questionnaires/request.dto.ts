import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateOnboardingQuestionnaireBody {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'OnboardingSchema definition. See docs for `single_choice` / `multi_choice` / `scale` / `text`. Validated server-side before write.',
  })
  @IsObject()
  schema: Record<string, unknown>;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateOnboardingQuestionnaireBody {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  schema?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class ListQuestionnairesQuery {
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  publishedOnly?: boolean;
}

export class SubmitResponseBody {
  @ApiProperty({
    description: 'User id (client). Must already be a member of this organisation (athlete role).',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Answers keyed by question id. Validated against the questionnaire schema.',
  })
  @IsObject()
  answers: Record<string, unknown>;
}

export class QuestionnaireIdParam {
  @IsUUID()
  id: string;
}

export class ClientIdParam {
  @IsUUID()
  id: string;
}

export class UserIdParam {
  @IsUUID()
  userId: string;
}
