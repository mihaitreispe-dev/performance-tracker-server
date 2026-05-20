import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PublicListMeta } from '../response.dto';

export class OnboardingQuestionnaireDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty()
  version: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'OnboardingSchema definition.',
  })
  schema: Record<string, unknown>;

  @ApiProperty()
  isPublished: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class OnboardingQuestionnaireResponse {
  @ApiProperty({ type: OnboardingQuestionnaireDTO })
  data: OnboardingQuestionnaireDTO;
}

export class OnboardingQuestionnaireListResponse {
  @ApiProperty({ type: [OnboardingQuestionnaireDTO] })
  data: OnboardingQuestionnaireDTO[];

  @ApiProperty({ type: PublicListMeta })
  meta: PublicListMeta;
}

export class OnboardingResponseDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  questionnaireId: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  answers: Record<string, unknown>;

  @ApiProperty({ type: [String], description: 'Profile tags derived from the answers.' })
  derivedTags: string[];

  @ApiProperty()
  completedAt: string;
}

export class OnboardingResponseSingle {
  @ApiProperty({ type: OnboardingResponseDTO })
  data: OnboardingResponseDTO;
}

export class OnboardingResponseList {
  @ApiProperty({ type: [OnboardingResponseDTO] })
  data: OnboardingResponseDTO[];

  @ApiProperty({ type: PublicListMeta })
  meta: PublicListMeta;
}

export class GeneratedWorkoutSummaryDTO {
  @ApiProperty({ description: 'Workout id; pull the full record via /v1/public/workouts/:id.' })
  workoutId: string;

  @ApiProperty()
  level: string;

  @ApiProperty()
  goal: string;

  @ApiProperty({ type: [String] })
  chosenExerciseIds: string[];

  @ApiProperty()
  durationMinutes: number;

  @ApiProperty()
  templateRationale: string;

  @ApiProperty({ type: [String], description: 'Tags fed into the generator.' })
  derivedTags: string[];
}

export class GeneratedWorkoutResponse {
  @ApiProperty({ type: GeneratedWorkoutSummaryDTO })
  data: GeneratedWorkoutSummaryDTO;
}
