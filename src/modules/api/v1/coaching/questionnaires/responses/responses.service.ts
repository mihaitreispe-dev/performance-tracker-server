import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import {
  BodyPartResponse,
  DateResponse,
  LongTextResponse,
  MoodResponse,
  MultiChoiceResponse,
  NotificationType,
  NumberResponse,
  QuestionnaireInstance,
  QuestionnaireResponse as QResponse,
  QuestionnaireStatus,
  QuestionSnapshot,
  RatingScaleResponse,
  ResponseValue,
  RpeResponse,
  ShortTextResponse,
  SingleChoiceResponse,
  SliderResponse,
  User,
  YesNoResponse,
} from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { QuestionnaireInstanceRepository } from 'src/repositories/questionnaire-instance.repository';
import { QuestionnaireResponseRepository } from 'src/repositories/questionnaire-response.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { NotificationsApiService } from '../../../notifications/notifications-api.service';
import {
  QuestionnaireInstanceDTO,
  QuestionnaireResponseDTO,
  TemplateSnapshotDTO,
  UserBasicDTO,
} from '../instances/response.dto';
import { ListMyQuestionnairesQuery, QuestionResponseDTO, SaveResponsesBody } from './request.dto';
import { AthleteQuestionnaireListResponse, AthleteQuestionnaireResponse, SubmitResponse } from './response.dto';

@Injectable()
export class ResponsesService {
  constructor(
    private readonly instanceRepo: QuestionnaireInstanceRepository,
    private readonly responseRepo: QuestionnaireResponseRepository,
    private readonly relationshipRepo: CoachAthleteRelationshipRepository,
    private readonly userRepo: UserRepository,
    private readonly notificationsService: NotificationsApiService,
  ) {}

  async listMyQuestionnaires(
    req: Request & { user: AuthUser },
    query: ListMyQuestionnairesQuery,
  ): Promise<AthleteQuestionnaireListResponse> {
    const athleteId = req.user.id;

    let statusFilter: QuestionnaireStatus | QuestionnaireStatus[] | undefined;
    if (query.pendingOnly) {
      statusFilter = [QuestionnaireStatus.PENDING, QuestionnaireStatus.IN_PROGRESS];
    } else if (query.status) {
      statusFilter = query.status as QuestionnaireStatus;
    }

    const filter = {
      athleteId,
      status: statusFilter,
    };

    const [instances, total] = await Promise.all([
      this.instanceRepo.findMany(filter, { limit: query.limit, offset: query.offset }),
      this.instanceRepo.count(filter),
    ]);

    // Fetch coach details for each instance
    const coachIds = [...new Set(instances.map((i) => i.coach_id))];
    const coaches = await this.userRepo.findByIds(coachIds);
    const coachMap = new Map(coaches.map((c) => [c.id, c]));

    const athlete = await this.userRepo.findById(athleteId);

    return {
      data: instances.map((i) => this.mapInstanceToDTO(i, coachMap.get(i.coach_id), athlete)),
      total,
    };
  }

  async getQuestionnaireToFill(req: Request & { user: AuthUser }, id: string): Promise<AthleteQuestionnaireResponse> {
    const athleteId = req.user.id;

    const instance = await this.instanceRepo.findById(id);
    if (!instance) {
      throw new NotFoundException('Questionnaire not found');
    }

    if (instance.athlete_id !== athleteId) {
      throw new ForbiddenException('This questionnaire is not assigned to you');
    }

    // Get existing responses if any
    const responses = await this.responseRepo.findByInstanceId(id);

    const [coach, athlete] = await Promise.all([
      this.userRepo.findById(instance.coach_id),
      this.userRepo.findById(athleteId),
    ]);

    return {
      data: this.mapInstanceToDTO(instance, coach, athlete, responses),
    };
  }

  async startQuestionnaire(req: Request & { user: AuthUser }, id: string): Promise<AthleteQuestionnaireResponse> {
    const athleteId = req.user.id;

    const instance = await this.instanceRepo.findById(id);
    if (!instance) {
      throw new NotFoundException('Questionnaire not found');
    }

    if (instance.athlete_id !== athleteId) {
      throw new ForbiddenException('This questionnaire is not assigned to you');
    }

    if (instance.status === QuestionnaireStatus.COMPLETED) {
      throw new BadRequestException('Questionnaire is already completed');
    }

    if (instance.status === QuestionnaireStatus.EXPIRED) {
      throw new BadRequestException('Questionnaire has expired');
    }

    // Check if expired by date
    if (instance.expires_at && new Date(instance.expires_at) < new Date()) {
      await this.instanceRepo.markAsExpired(id);
      throw new BadRequestException('Questionnaire has expired');
    }

    // Mark as started if pending
    if (instance.status === QuestionnaireStatus.PENDING) {
      await this.instanceRepo.markAsStarted(id);
    }

    const updatedInstance = await this.instanceRepo.findById(id);
    const [coach, athlete] = await Promise.all([
      this.userRepo.findById(instance.coach_id),
      this.userRepo.findById(athleteId),
    ]);

    return {
      data: this.mapInstanceToDTO(updatedInstance!, coach, athlete),
    };
  }

  async saveResponses(
    req: Request & { user: AuthUser },
    id: string,
    body: SaveResponsesBody,
  ): Promise<AthleteQuestionnaireResponse> {
    const athleteId = req.user.id;

    const instance = await this.instanceRepo.findById(id);
    if (!instance) {
      throw new NotFoundException('Questionnaire not found');
    }

    if (instance.athlete_id !== athleteId) {
      throw new ForbiddenException('This questionnaire is not assigned to you');
    }

    if (instance.status === QuestionnaireStatus.COMPLETED) {
      throw new BadRequestException('Questionnaire is already completed');
    }

    if (instance.status === QuestionnaireStatus.EXPIRED) {
      throw new BadRequestException('Questionnaire has expired');
    }

    // Check if expired by date
    if (instance.expires_at && new Date(instance.expires_at) < new Date()) {
      await this.instanceRepo.markAsExpired(id);
      throw new BadRequestException('Questionnaire has expired');
    }

    // Start if pending
    if (instance.status === QuestionnaireStatus.PENDING) {
      await this.instanceRepo.markAsStarted(id);
    }

    // Build question map from snapshot
    const questionMap = new Map(instance.template_snapshot.questions.map((q) => [q.id, q]));

    // Save/update responses
    for (const resp of body.responses) {
      const question = questionMap.get(resp.questionId);
      if (!question) {
        // Skip invalid question IDs
        continue;
      }

      const responseValue = this.convertResponseValue(question, resp.response);

      await this.responseRepo.upsert({
        instance_id: id,
        question_id: resp.questionId,
        question_snapshot: question,
        response_value: responseValue,
      });
    }

    const responses = await this.responseRepo.findByInstanceId(id);
    const updatedInstance = await this.instanceRepo.findById(id);
    const [coach, athlete] = await Promise.all([
      this.userRepo.findById(instance.coach_id),
      this.userRepo.findById(athleteId),
    ]);

    return {
      data: this.mapInstanceToDTO(updatedInstance!, coach, athlete, responses),
    };
  }

  async submitQuestionnaire(req: Request & { user: AuthUser }, id: string): Promise<SubmitResponse> {
    const athleteId = req.user.id;

    const instance = await this.instanceRepo.findById(id);
    if (!instance) {
      throw new NotFoundException('Questionnaire not found');
    }

    if (instance.athlete_id !== athleteId) {
      throw new ForbiddenException('This questionnaire is not assigned to you');
    }

    if (instance.status === QuestionnaireStatus.COMPLETED) {
      throw new BadRequestException('Questionnaire is already completed');
    }

    if (instance.status === QuestionnaireStatus.EXPIRED) {
      throw new BadRequestException('Questionnaire has expired');
    }

    // Validate all required questions are answered
    const responses = await this.responseRepo.findByInstanceId(id);
    const answeredQuestionIds = new Set(responses.map((r) => r.question_id));
    const requiredQuestions = instance.template_snapshot.questions.filter((q) => q.isRequired);

    const missingRequired = requiredQuestions.filter((q) => !answeredQuestionIds.has(q.id));
    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `Missing required responses for questions: ${missingRequired.map((q) => q.questionText).join(', ')}`,
      );
    }

    // Mark as completed
    const completed = await this.instanceRepo.markAsCompleted(id);

    // Notify coach
    const athlete = await this.userRepo.findById(athleteId);
    const athleteName = athlete?.display_name || athlete?.first_name || 'Your athlete';
    await this.notificationsService.createNotifications([
      {
        userId: instance.coach_id,
        type: NotificationType.QUESTIONNAIRE_COMPLETED,
        title: `${athleteName} completed a questionnaire`,
        body: instance.template_snapshot.name,
        data: {
          athleteId,
          questionnaireInstanceId: instance.id,
          questionnaireName: instance.template_snapshot.name,
          relationshipId: instance.relationship_id,
        },
      },
    ]);

    const completedAt = completed?.completed_at;
    return {
      data: {
        success: true,
        completedAt: completedAt instanceof Date ? completedAt.toISOString() : String(completedAt),
      },
    };
  }

  // Helper methods
  private convertResponseValue(question: QuestionSnapshot, response: QuestionResponseDTO['response']): ResponseValue {
    switch (question.questionType) {
      case 'single_choice':
        return { type: 'single_choice', value: response.value! } as SingleChoiceResponse;

      case 'multi_choice':
        return { type: 'multi_choice', values: response.values! } as MultiChoiceResponse;

      case 'rating_scale':
        return { type: 'rating_scale', value: response.numValue! } as RatingScaleResponse;

      case 'slider':
        return { type: 'slider', value: response.numValue! } as SliderResponse;

      case 'short_text':
        return { type: 'short_text', value: response.value! } as ShortTextResponse;

      case 'long_text':
        return { type: 'long_text', value: response.value! } as LongTextResponse;

      case 'yes_no':
        return { type: 'yes_no', value: response.boolValue! } as YesNoResponse;

      case 'date':
        return { type: 'date', value: response.value! } as DateResponse;

      case 'number':
        return { type: 'number', value: response.numValue! } as NumberResponse;

      case 'body_part':
        return {
          type: 'body_part',
          parts: response.parts || [],
        } as BodyPartResponse;

      case 'rpe':
        return { type: 'rpe', value: response.numValue! } as RpeResponse;

      case 'mood':
        return { type: 'mood', value: response.value! } as MoodResponse;

      default:
        return null;
    }
  }

  private mapInstanceToDTO(
    instance: QuestionnaireInstance,
    coach?: User,
    athlete?: User,
    responses?: QResponse[],
  ): QuestionnaireInstanceDTO {
    return {
      id: instance.id,
      templateId: instance.template_id,
      relationshipId: instance.relationship_id,
      coachId: instance.coach_id,
      coach: coach ? this.mapUserToBasicDTO(coach) : undefined,
      athleteId: instance.athlete_id,
      athlete: athlete ? this.mapUserToBasicDTO(athlete) : undefined,
      messageId: instance.message_id,
      status: instance.status,
      sentAt: instance.sent_at instanceof Date ? instance.sent_at.toISOString() : String(instance.sent_at),
      startedAt: instance.started_at
        ? instance.started_at instanceof Date
          ? instance.started_at.toISOString()
          : String(instance.started_at)
        : null,
      completedAt: instance.completed_at
        ? instance.completed_at instanceof Date
          ? instance.completed_at.toISOString()
          : String(instance.completed_at)
        : null,
      expiresAt: instance.expires_at
        ? instance.expires_at instanceof Date
          ? instance.expires_at.toISOString()
          : String(instance.expires_at)
        : null,
      templateSnapshot: this.mapTemplateSnapshotToDTO(instance.template_snapshot),
      responses: responses?.map((r) => this.mapResponseToDTO(r)),
      createdAt: instance.created_at instanceof Date ? instance.created_at.toISOString() : String(instance.created_at),
      updatedAt: instance.updated_at instanceof Date ? instance.updated_at.toISOString() : String(instance.updated_at),
    };
  }

  private mapTemplateSnapshotToDTO(snapshot: any): TemplateSnapshotDTO {
    return {
      id: snapshot.id,
      name: snapshot.name,
      description: snapshot.description,
      category: snapshot.category,
      questions: snapshot.questions.map((q: any) => ({
        id: q.id,
        templateId: snapshot.id,
        questionText: q.questionText,
        questionType: q.questionType,
        isRequired: q.isRequired,
        orderIndex: q.orderIndex,
        config: q.config,
        createdAt: '',
        updatedAt: '',
      })),
    };
  }

  private mapResponseToDTO(response: QResponse): QuestionnaireResponseDTO {
    return {
      id: response.id,
      questionId: response.question_id,
      questionSnapshot: {
        id: response.question_snapshot.id,
        templateId: '',
        questionText: response.question_snapshot.questionText,
        questionType: response.question_snapshot.questionType,
        isRequired: response.question_snapshot.isRequired,
        orderIndex: response.question_snapshot.orderIndex,
        config: response.question_snapshot.config as any,
        createdAt: '',
        updatedAt: '',
      },
      responseValue: response.response_value,
      createdAt: response.created_at instanceof Date ? response.created_at.toISOString() : String(response.created_at),
      updatedAt: response.updated_at instanceof Date ? response.updated_at.toISOString() : String(response.updated_at),
    };
  }

  private mapUserToBasicDTO(user: User): UserBasicDTO {
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      firstName: user.first_name,
      lastName: user.last_name,
      picture: null,
    };
  }
}
