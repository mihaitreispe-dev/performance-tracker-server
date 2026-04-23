import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import {
  CoachAthleteStatus,
  NotificationType,
  QuestionConfig,
  QuestionnaireCategory,
  QuestionnaireInstance,
  QuestionnaireResponse as QResponse,
  QuestionnaireStatus,
  QuestionSnapshot,
  QuestionType,
  TemplateSnapshot,
  User,
} from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { CoachingMessageRepository } from 'src/repositories/coaching-message.repository';
import { QuestionnaireInstanceRepository } from 'src/repositories/questionnaire-instance.repository';
import { QuestionnaireQuestionRepository } from 'src/repositories/questionnaire-question.repository';
import { QuestionnaireResponseRepository } from 'src/repositories/questionnaire-response.repository';
import { QuestionnaireTemplateRepository } from 'src/repositories/questionnaire-template.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { NotificationsApiService } from '../../../notifications/notifications-api.service';
import {
  CompareQuestionnairesQuery,
  ListAthleteQuestionnairesQuery,
  QuickCreateAndSendBody,
  SendQuestionnaireToAthleteBody,
  SendQuestionnaireToMultipleBody,
} from './request.dto';
import {
  CompareQuestionnairesDTO,
  CompareQuestionnairesResponse,
  ComparisonResponseDTO,
  QuestionnaireInstanceDTO,
  QuestionnaireInstanceListResponse,
  QuestionnaireInstanceResponse,
  QuestionnaireResponseDTO,
  SendQuestionnaireResponse,
  SendQuestionnaireResultDTO,
  TemplateSnapshotDTO,
  UserBasicDTO,
} from './response.dto';

@Injectable()
export class InstancesService {
  constructor(
    private readonly templateRepo: QuestionnaireTemplateRepository,
    private readonly questionRepo: QuestionnaireQuestionRepository,
    private readonly instanceRepo: QuestionnaireInstanceRepository,
    private readonly responseRepo: QuestionnaireResponseRepository,
    private readonly relationshipRepo: CoachAthleteRelationshipRepository,
    private readonly messageRepo: CoachingMessageRepository,
    private readonly userRepo: UserRepository,
    private readonly notificationsService: NotificationsApiService,
  ) {}

  async sendToAthlete(
    req: Request & { user: AuthUser },
    athleteId: string,
    body: SendQuestionnaireToAthleteBody,
  ): Promise<QuestionnaireInstanceResponse> {
    const coachId = req.user.id;

    // Verify relationship
    const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(coachId, athleteId);
    if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
      throw new BadRequestException('No active coaching relationship with this athlete');
    }

    // Get template and questions
    const template = await this.templateRepo.findById(body.templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    if (template.coach_id !== coachId) {
      throw new ForbiddenException('You can only send your own templates');
    }

    const questions = await this.questionRepo.findByTemplateId(body.templateId);
    if (questions.length === 0) {
      throw new BadRequestException('Template has no questions');
    }

    // Create template snapshot
    const templateSnapshot = this.createTemplateSnapshot(template, questions);

    // Create message if content provided
    let messageId: string | null = null;
    if (body.message) {
      const message = await this.messageRepo.create({
        relationship_id: relationship.id,
        sender_id: coachId,
        content: body.message,
      });
      messageId = message.id;
    }

    // Create instance
    const instance = await this.instanceRepo.create({
      template_id: body.templateId,
      relationship_id: relationship.id,
      coach_id: coachId,
      athlete_id: athleteId,
      message_id: messageId,
      expires_at: body.expiresAt ? new Date(body.expiresAt) : null,
      template_snapshot: templateSnapshot,
    });

    // Update message with questionnaire ID if message was created
    if (messageId) {
      await this.messageRepo.updateById(messageId, {
        attached_questionnaire_id: instance.id,
      });
    }

    // Send notification to athlete
    const coach = await this.userRepo.findById(coachId);
    const coachName = coach?.display_name || coach?.first_name || 'Your coach';
    await this.notificationsService.createNotifications([
      {
        userId: athleteId,
        type: NotificationType.QUESTIONNAIRE_SENT,
        title: `${coachName} sent you a questionnaire`,
        body: template.name,
        data: {
          coachId,
          questionnaireInstanceId: instance.id,
          questionnaireName: template.name,
          relationshipId: relationship.id,
        },
      },
    ]);

    // Fetch user details for response
    const [coachData, athleteData] = await Promise.all([
      this.userRepo.findById(coachId),
      this.userRepo.findById(athleteId),
    ]);

    return {
      data: this.mapInstanceToDTO(instance, coachData, athleteData),
    };
  }

  async sendToMultiple(
    req: Request & { user: AuthUser },
    templateId: string,
    body: SendQuestionnaireToMultipleBody,
  ): Promise<SendQuestionnaireResponse> {
    const coachId = req.user.id;

    // Get template and questions
    const template = await this.templateRepo.findById(templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    if (template.coach_id !== coachId) {
      throw new ForbiddenException('You can only send your own templates');
    }

    const questions = await this.questionRepo.findByTemplateId(templateId);
    if (questions.length === 0) {
      throw new BadRequestException('Template has no questions');
    }

    // Create template snapshot
    const templateSnapshot = this.createTemplateSnapshot(template, questions);

    // Verify all relationships
    const results: SendQuestionnaireResultDTO = { sent: 0, instanceIds: [] };

    for (const athleteId of body.athleteIds) {
      const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(coachId, athleteId);
      if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
        continue; // Skip invalid relationships
      }

      // Create message if content provided
      let messageId: string | null = null;
      if (body.message) {
        const message = await this.messageRepo.create({
          relationship_id: relationship.id,
          sender_id: coachId,
          content: body.message,
        });
        messageId = message.id;
      }

      // Create instance
      const instance = await this.instanceRepo.create({
        template_id: templateId,
        relationship_id: relationship.id,
        coach_id: coachId,
        athlete_id: athleteId,
        message_id: messageId,
        expires_at: body.expiresAt ? new Date(body.expiresAt) : null,
        template_snapshot: templateSnapshot,
      });

      // Update message with questionnaire ID
      if (messageId) {
        await this.messageRepo.updateById(messageId, {
          attached_questionnaire_id: instance.id,
        });
      }

      results.sent++;
      results.instanceIds.push(instance.id);
    }

    // Send notifications
    if (results.sent > 0) {
      const coach = await this.userRepo.findById(coachId);
      const coachName = coach?.display_name || coach?.first_name || 'Your coach';
      const notifications = body.athleteIds
        .filter((id) =>
          results.instanceIds.some(async (instId) => {
            const inst = await this.instanceRepo.findById(instId);
            return inst?.athlete_id === id;
          }),
        )
        .map((athleteId, index) => ({
          userId: athleteId,
          type: NotificationType.QUESTIONNAIRE_SENT as NotificationType,
          title: `${coachName} sent you a questionnaire`,
          body: template.name,
          data: {
            coachId,
            questionnaireInstanceId: results.instanceIds[index],
            questionnaireName: template.name,
          },
        }));

      if (notifications.length > 0) {
        await this.notificationsService.createNotifications(notifications);
      }
    }

    return {
      data: results,
    };
  }

  async quickCreateAndSend(
    req: Request & { user: AuthUser },
    athleteId: string,
    body: QuickCreateAndSendBody,
  ): Promise<QuestionnaireInstanceResponse> {
    const coachId = req.user.id;

    // Verify relationship
    const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(coachId, athleteId);
    if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
      throw new BadRequestException('No active coaching relationship with this athlete');
    }

    // Optionally save as template
    let templateId: string | null = null;
    if (body.saveAsTemplate) {
      const template = await this.templateRepo.create({
        coach_id: coachId,
        name: body.name,
        description: body.description || null,
        category: QuestionnaireCategory.CUSTOM,
      });
      templateId = template.id;

      // Create questions in template
      const questionData = body.questions.map((q, index) => ({
        template_id: template.id,
        question_text: q.questionText,
        question_type: q.questionType as QuestionType,
        is_required: q.isRequired ?? true,
        order_index: index,
        config: (q.config as QuestionConfig) || null,
      }));
      await this.questionRepo.createMany(questionData);
    }

    // Create snapshot from body
    const questionSnapshots: QuestionSnapshot[] = body.questions.map((q, index) => ({
      id: `temp-${index}`,
      questionText: q.questionText,
      questionType: q.questionType as QuestionType,
      isRequired: q.isRequired ?? true,
      orderIndex: index,
      config: (q.config as QuestionConfig) || null,
    }));

    const templateSnapshot: TemplateSnapshot = {
      id: templateId || 'quick-create',
      name: body.name,
      description: body.description || null,
      category: QuestionnaireCategory.CUSTOM,
      questions: questionSnapshots,
    };

    // Create message if content provided
    let messageId: string | null = null;
    if (body.message) {
      const message = await this.messageRepo.create({
        relationship_id: relationship.id,
        sender_id: coachId,
        content: body.message,
      });
      messageId = message.id;
    }

    // Create instance
    const instance = await this.instanceRepo.create({
      template_id: templateId,
      relationship_id: relationship.id,
      coach_id: coachId,
      athlete_id: athleteId,
      message_id: messageId,
      expires_at: body.expiresAt ? new Date(body.expiresAt) : null,
      template_snapshot: templateSnapshot,
    });

    // Update message with questionnaire ID
    if (messageId) {
      await this.messageRepo.updateById(messageId, {
        attached_questionnaire_id: instance.id,
      });
    }

    // Send notification
    const coach = await this.userRepo.findById(coachId);
    const coachName = coach?.display_name || coach?.first_name || 'Your coach';
    await this.notificationsService.createNotifications([
      {
        userId: athleteId,
        type: NotificationType.QUESTIONNAIRE_SENT,
        title: `${coachName} sent you a questionnaire`,
        body: body.name,
        data: {
          coachId,
          questionnaireInstanceId: instance.id,
          questionnaireName: body.name,
        },
      },
    ]);

    // Fetch user details
    const [coachData, athleteData] = await Promise.all([
      this.userRepo.findById(coachId),
      this.userRepo.findById(athleteId),
    ]);

    return {
      data: this.mapInstanceToDTO(instance, coachData, athleteData),
    };
  }

  async listAthleteQuestionnaires(
    req: Request & { user: AuthUser },
    athleteId: string,
    query: ListAthleteQuestionnairesQuery,
  ): Promise<QuestionnaireInstanceListResponse> {
    const coachId = req.user.id;

    // Verify relationship
    const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(coachId, athleteId);
    if (!relationship) {
      throw new ForbiddenException('No coaching relationship with this athlete');
    }

    const filter = {
      athleteId,
      coachId,
      status: query.status as QuestionnaireStatus | undefined,
      templateId: query.templateId,
    };

    const [instances, total] = await Promise.all([
      this.instanceRepo.findMany(filter, { limit: query.limit, offset: query.offset }),
      this.instanceRepo.count(filter),
    ]);

    // Fetch user details
    const [coachData, athleteData] = await Promise.all([
      this.userRepo.findById(coachId),
      this.userRepo.findById(athleteId),
    ]);

    return {
      data: instances.map((i) => this.mapInstanceToDTO(i, coachData, athleteData)),
      total,
    };
  }

  async getInstanceById(req: Request & { user: AuthUser }, id: string): Promise<QuestionnaireInstanceResponse> {
    const instance = await this.instanceRepo.findById(id);
    if (!instance) {
      throw new NotFoundException('Questionnaire instance not found');
    }

    // Verify access (coach or athlete)
    if (instance.coach_id !== req.user.id && instance.athlete_id !== req.user.id) {
      throw new ForbiddenException('You do not have access to this questionnaire');
    }

    const responses = await this.responseRepo.findByInstanceId(id);
    const [coachData, athleteData] = await Promise.all([
      this.userRepo.findById(instance.coach_id),
      this.userRepo.findById(instance.athlete_id),
    ]);

    return {
      data: this.mapInstanceToDTO(instance, coachData, athleteData, responses),
    };
  }

  async sendReminder(req: Request & { user: AuthUser }, id: string): Promise<QuestionnaireInstanceResponse> {
    const instance = await this.instanceRepo.findById(id);
    if (!instance) {
      throw new NotFoundException('Questionnaire instance not found');
    }

    if (instance.coach_id !== req.user.id) {
      throw new ForbiddenException('You can only send reminders for your own questionnaires');
    }

    if (instance.status === QuestionnaireStatus.COMPLETED) {
      throw new BadRequestException('Questionnaire is already completed');
    }

    if (instance.status === QuestionnaireStatus.EXPIRED) {
      throw new BadRequestException('Questionnaire has expired');
    }

    // Send reminder notification
    const coach = await this.userRepo.findById(instance.coach_id);
    const coachName = coach?.display_name || coach?.first_name || 'Your coach';
    await this.notificationsService.createNotifications([
      {
        userId: instance.athlete_id,
        type: NotificationType.QUESTIONNAIRE_REMINDER,
        title: `Reminder: ${coachName} is waiting for your response`,
        body: instance.template_snapshot.name,
        data: {
          coachId: instance.coach_id,
          questionnaireInstanceId: instance.id,
          questionnaireName: instance.template_snapshot.name,
        },
      },
    ]);

    const [coachData, athleteData] = await Promise.all([
      this.userRepo.findById(instance.coach_id),
      this.userRepo.findById(instance.athlete_id),
    ]);

    return {
      data: this.mapInstanceToDTO(instance, coachData, athleteData),
    };
  }

  async compareResponses(
    req: Request & { user: AuthUser },
    athleteId: string,
    query: CompareQuestionnairesQuery,
  ): Promise<CompareQuestionnairesResponse> {
    const coachId = req.user.id;

    // Verify relationship
    const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(coachId, athleteId);
    if (!relationship) {
      throw new ForbiddenException('No coaching relationship with this athlete');
    }

    // Get completed instances for this template and athlete
    const instances = await this.instanceRepo.findMany(
      {
        templateId: query.templateId,
        athleteId,
        status: QuestionnaireStatus.COMPLETED,
      },
      { limit: query.limit || 10 },
    );

    if (instances.length < 2) {
      throw new BadRequestException('Need at least 2 completed questionnaires to compare');
    }

    // Get template info
    const template = await this.templateRepo.findById(query.templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // Fetch all responses for these instances
    const responsesByInstance = new Map<string, QResponse[]>();
    for (const instance of instances) {
      const responses = await this.responseRepo.findByInstanceId(instance.id);
      responsesByInstance.set(instance.id, responses);
    }

    // Build comparison data
    const comparisons: ComparisonResponseDTO[] = [];
    const firstInstance = instances[0];
    const questions = firstInstance.template_snapshot.questions;

    for (const question of questions) {
      const instanceResponses: Record<string, any> = {};
      for (const instance of instances) {
        const responses = responsesByInstance.get(instance.id) || [];
        const response = responses.find((r) => r.question_id === question.id);
        instanceResponses[instance.id] = response?.response_value || null;
      }

      comparisons.push({
        questionId: question.id,
        questionText: question.questionText,
        questionType: question.questionType,
        instanceResponses,
      });
    }

    // Fetch user details
    const [coachData, athleteData] = await Promise.all([
      this.userRepo.findById(coachId),
      this.userRepo.findById(athleteId),
    ]);

    return {
      data: {
        template: {
          id: template.id,
          name: template.name,
        },
        instances: instances.map((i) => this.mapInstanceToDTO(i, coachData, athleteData)),
        comparisons,
      },
    };
  }

  // Helper methods
  private createTemplateSnapshot(template: any, questions: any[]): TemplateSnapshot {
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      questions: questions.map((q) => ({
        id: q.id,
        questionText: q.question_text,
        questionType: q.question_type,
        isRequired: q.is_required,
        orderIndex: q.order_index,
        config: q.config,
      })),
    };
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

  private mapTemplateSnapshotToDTO(snapshot: TemplateSnapshot): TemplateSnapshotDTO {
    return {
      id: snapshot.id,
      name: snapshot.name,
      description: snapshot.description,
      category: snapshot.category,
      questions: snapshot.questions.map((q) => ({
        id: q.id,
        templateId: snapshot.id,
        questionText: q.questionText,
        questionType: q.questionType,
        isRequired: q.isRequired,
        orderIndex: q.orderIndex,
        config: q.config as any,
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
