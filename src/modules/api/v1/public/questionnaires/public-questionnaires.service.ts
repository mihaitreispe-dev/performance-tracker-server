import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  OnboardingQuestionnaire,
  OnboardingResponse,
  OnboardingSchema,
  OrganisationRole,
  QuestionnaireAnswers,
} from 'src/database/interfaces';
import { OnboardingQuestionnaireRepository } from 'src/repositories/onboarding-questionnaire.repository';
import { OnboardingResponseRepository } from 'src/repositories/onboarding-response.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';

import {
  CreateOnboardingQuestionnaireBody,
  ListQuestionnairesQuery,
  SubmitResponseBody,
  UpdateOnboardingQuestionnaireBody,
} from './request.dto';
import {
  GeneratedWorkoutResponse,
  OnboardingQuestionnaireDTO,
  OnboardingQuestionnaireListResponse,
  OnboardingQuestionnaireResponse,
  OnboardingResponseDTO,
  OnboardingResponseList,
  OnboardingResponseSingle,
} from './response.dto';
import { deriveTags, validateAnswers, validateOnboardingSchema } from './schema';
import { WorkoutGeneratorService } from './workout-generator';

@Injectable()
export class PublicQuestionnairesService {
  constructor(
    private readonly questionnaireRepo: OnboardingQuestionnaireRepository,
    private readonly responseRepo: OnboardingResponseRepository,
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly generator: WorkoutGeneratorService,
  ) {}

  // -------- Questionnaires --------

  async list(
    organisationId: string,
    query: ListQuestionnairesQuery,
  ): Promise<OnboardingQuestionnaireListResponse> {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    const rows = await this.questionnaireRepo.listByOrg(organisationId, {
      offset,
      limit,
      publishedOnly: query.publishedOnly,
    });
    return {
      data: rows.map(mapQuestionnaireDTO),
      meta: { totalCount: rows.length, offset, limit },
    };
  }

  async getById(organisationId: string, id: string): Promise<OnboardingQuestionnaireResponse> {
    const row = await this.questionnaireRepo.findByIdInOrg(id, organisationId);
    if (!row) throw new NotFoundException('Questionnaire not found');
    return { data: mapQuestionnaireDTO(row) };
  }

  async create(
    organisationId: string,
    body: CreateOnboardingQuestionnaireBody,
  ): Promise<OnboardingQuestionnaireResponse> {
    const validation = validateOnboardingSchema(body.schema);
    if (!validation.ok) {
      throw new UnprocessableEntityException({
        message: 'Invalid questionnaire schema',
        errors: validation.errors,
      });
    }
    const row = await this.questionnaireRepo.create({
      organisation_id: organisationId,
      name: body.name.trim(),
      description: body.description ?? null,
      schema_json: body.schema as unknown as OnboardingSchema,
      is_published: !!body.isPublished,
      created_by_user_id: null,
    });
    return { data: mapQuestionnaireDTO(row) };
  }

  async update(
    organisationId: string,
    id: string,
    body: UpdateOnboardingQuestionnaireBody,
  ): Promise<OnboardingQuestionnaireResponse> {
    const existing = await this.questionnaireRepo.findByIdInOrg(id, organisationId);
    if (!existing) throw new NotFoundException('Questionnaire not found');

    if (body.schema) {
      const validation = validateOnboardingSchema(body.schema);
      if (!validation.ok) {
        throw new UnprocessableEntityException({
          message: 'Invalid questionnaire schema',
          errors: validation.errors,
        });
      }
    }
    const row = await this.questionnaireRepo.updateById(id, {
      name: body.name?.trim() ?? existing.name,
      description: body.description ?? existing.description,
      schema_json: (body.schema as unknown as OnboardingSchema | undefined) ?? existing.schema_json,
      is_published: body.isPublished ?? existing.is_published,
    });
    return { data: mapQuestionnaireDTO(row) };
  }

  // -------- Responses --------

  async submitResponse(
    organisationId: string,
    questionnaireId: string,
    body: SubmitResponseBody,
  ): Promise<OnboardingResponseSingle> {
    const questionnaire = await this.questionnaireRepo.findByIdInOrg(questionnaireId, organisationId);
    if (!questionnaire) throw new NotFoundException('Questionnaire not found');

    // Belt-and-braces tenant check: the answering user must be a member of this org.
    // Lets the integrating app's bug catch before we leak a workout across tenants.
    const membership = await this.membershipRepo.findByUserAndOrg(body.userId, organisationId);
    if (!membership || membership.role !== OrganisationRole.ATHLETE) {
      throw new NotFoundException(
        'User is not a member of this organisation (athlete role required). Create them via POST /v1/public/clients first.',
      );
    }

    const answers = body.answers as QuestionnaireAnswers;
    const answerCheck = validateAnswers(questionnaire.schema_json, answers);
    if (!answerCheck.ok) {
      throw new UnprocessableEntityException({
        message: 'Answers do not match the questionnaire schema',
        errors: answerCheck.errors,
      });
    }
    const derivedTags = deriveTags(questionnaire.schema_json, answers);

    const row = await this.responseRepo.create({
      questionnaire_id: questionnaireId,
      organisation_id: organisationId,
      user_id: body.userId,
      answers_json: answers,
      derived_tags: derivedTags,
    });

    return { data: mapResponseDTO(row) };
  }

  async listResponsesForUser(
    organisationId: string,
    userId: string,
  ): Promise<OnboardingResponseList> {
    const rows = await this.responseRepo.listByUserOrg(userId, organisationId, { limit: 50 });
    return {
      data: rows.map(mapResponseDTO),
      meta: { totalCount: rows.length, offset: 0, limit: 50 },
    };
  }

  // -------- Generation --------

  /**
   * Run the workout generator against the user's most recent onboarding response.
   *
   *   - If there's no response yet, 422 — the caller hasn't done the onboarding step.
   *   - If the user isn't an athlete member of this org, 404.
   *   - On success, returns the new workout id plus a summary describing the
   *     decisions (which template, why) so the integrating app can show the user
   *     a transparent "we picked this because you said X" surface.
   */
  async generateWorkoutForClient(
    organisationId: string,
    userId: string,
  ): Promise<GeneratedWorkoutResponse> {
    const membership = await this.membershipRepo.findByUserAndOrg(userId, organisationId);
    if (!membership || membership.role !== OrganisationRole.ATHLETE) {
      throw new NotFoundException('Client not found in this organisation');
    }
    const latest = await this.responseRepo.latestForUserOrg(userId, organisationId);
    if (!latest) {
      throw new UnprocessableEntityException(
        'No onboarding response on file for this user — submit one via POST /v1/public/questionnaires/:id/responses first.',
      );
    }

    const result = await this.generator.generate({
      organisationId,
      userId,
      tags: latest.derived_tags,
      responseId: latest.id,
    });

    return {
      data: {
        workoutId: result.workoutId,
        level: result.level,
        goal: result.goal,
        chosenExerciseIds: result.chosenExerciseIds,
        durationMinutes: result.durationMinutes,
        templateRationale: result.template.rationale,
        derivedTags: latest.derived_tags,
      },
    };
  }
}

// --- mappers ---

function mapQuestionnaireDTO(row: OnboardingQuestionnaire): OnboardingQuestionnaireDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    schema: row.schema_json as unknown as Record<string, unknown>,
    isPublished: row.is_published,
    createdAt: isoOf(row.created_at),
    updatedAt: isoOf(row.updated_at),
  };
}

function mapResponseDTO(row: OnboardingResponse): OnboardingResponseDTO {
  return {
    id: row.id,
    questionnaireId: row.questionnaire_id,
    userId: row.user_id,
    answers: row.answers_json as Record<string, unknown>,
    derivedTags: row.derived_tags,
    completedAt: isoOf(row.completed_at),
  };
}

function isoOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}
