import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import {
  QuestionConfig,
  QuestionnaireCategory,
  QuestionnaireQuestion,
  QuestionnaireTemplate,
  QuestionType,
} from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { QuestionnaireQuestionRepository } from 'src/repositories/questionnaire-question.repository';
import { QuestionnaireTemplateRepository } from 'src/repositories/questionnaire-template.repository';

import {
  AddQuestionBody,
  CreateQuestionnaireTemplateBody,
  ListTemplatesQuery,
  ReorderQuestionsBody,
  UpdateQuestionBody,
  UpdateQuestionnaireTemplateBody,
} from './request.dto';
import {
  QuestionDTO,
  QuestionnaireTemplateDTO,
  QuestionnaireTemplateListResponse,
  QuestionnaireTemplateResponse,
  QuestionResponse,
} from './response.dto';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly templateRepo: QuestionnaireTemplateRepository,
    private readonly questionRepo: QuestionnaireQuestionRepository,
  ) {}

  async create(
    req: Request & { user: AuthUser },
    body: CreateQuestionnaireTemplateBody,
  ): Promise<QuestionnaireTemplateResponse> {
    const coachId = req.user.id;

    const template = await this.templateRepo.create({
      coach_id: coachId,
      name: body.name,
      description: body.description || null,
      category: (body.category as QuestionnaireCategory) || QuestionnaireCategory.CUSTOM,
    });

    // Create initial questions if provided
    let questions: QuestionnaireQuestion[] = [];
    if (body.questions && body.questions.length > 0) {
      const questionData = body.questions.map((q, index) => ({
        template_id: template.id,
        question_text: q.questionText,
        question_type: q.questionType as QuestionType,
        is_required: q.isRequired ?? true,
        order_index: index,
        config: (q.config as QuestionConfig) || null,
      }));
      questions = await this.questionRepo.createMany(questionData);
    }

    return {
      data: this.mapTemplateToDTO(template, questions),
    };
  }

  async list(req: Request & { user: AuthUser }, query: ListTemplatesQuery): Promise<QuestionnaireTemplateListResponse> {
    const coachId = req.user.id;

    const filter = {
      coachId,
      category: query.category as QuestionnaireCategory | undefined,
      isArchived: query.includeArchived ? undefined : false,
      search: query.search,
    };

    const [templates, total] = await Promise.all([
      this.templateRepo.findMany(filter, { limit: query.limit, offset: query.offset }),
      this.templateRepo.count(filter),
    ]);

    // Get question counts for each template
    const templateIds = templates.map((t) => t.id);
    const questionCounts = await this.getQuestionCounts(templateIds);

    return {
      data: templates.map((t) => this.mapTemplateToDTO(t, undefined, questionCounts.get(t.id) || 0)),
      total,
    };
  }

  async getById(req: Request & { user: AuthUser }, id: string): Promise<QuestionnaireTemplateResponse> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.coach_id !== req.user.id) {
      throw new ForbiddenException('You can only access your own templates');
    }

    const questions = await this.questionRepo.findByTemplateId(id);

    return {
      data: this.mapTemplateToDTO(template, questions),
    };
  }

  async update(
    req: Request & { user: AuthUser },
    id: string,
    body: UpdateQuestionnaireTemplateBody,
  ): Promise<QuestionnaireTemplateResponse> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.coach_id !== req.user.id) {
      throw new ForbiddenException('You can only update your own templates');
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.category !== undefined) updateData.category = body.category;

    const updated = await this.templateRepo.updateById(id, updateData);
    const questions = await this.questionRepo.findByTemplateId(id);

    return {
      data: this.mapTemplateToDTO(updated!, questions),
    };
  }

  async archive(req: Request & { user: AuthUser }, id: string): Promise<QuestionnaireTemplateResponse> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.coach_id !== req.user.id) {
      throw new ForbiddenException('You can only archive your own templates');
    }

    const updated = await this.templateRepo.archive(id);
    const questions = await this.questionRepo.findByTemplateId(id);

    return {
      data: this.mapTemplateToDTO(updated!, questions),
    };
  }

  async duplicate(req: Request & { user: AuthUser }, id: string): Promise<QuestionnaireTemplateResponse> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.coach_id !== req.user.id) {
      throw new ForbiddenException('You can only duplicate your own templates');
    }

    const questions = await this.questionRepo.findByTemplateId(id);

    // Create new template
    const newTemplate = await this.templateRepo.create({
      coach_id: req.user.id,
      name: `${template.name} (Copy)`,
      description: template.description,
      category: template.category,
    });

    // Duplicate questions
    let newQuestions: QuestionnaireQuestion[] = [];
    if (questions.length > 0) {
      const questionData = questions.map((q) => ({
        template_id: newTemplate.id,
        question_text: q.question_text,
        question_type: q.question_type,
        is_required: q.is_required,
        order_index: q.order_index,
        config: q.config,
      }));
      newQuestions = await this.questionRepo.createMany(questionData);
    }

    return {
      data: this.mapTemplateToDTO(newTemplate, newQuestions),
    };
  }

  // Question CRUD
  async addQuestion(
    req: Request & { user: AuthUser },
    templateId: string,
    body: AddQuestionBody,
  ): Promise<QuestionResponse> {
    const template = await this.templateRepo.findById(templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.coach_id !== req.user.id) {
      throw new ForbiddenException('You can only modify your own templates');
    }

    // Determine order index
    let orderIndex = body.orderIndex;
    if (orderIndex === undefined) {
      const maxIndex = await this.questionRepo.getMaxOrderIndex(templateId);
      orderIndex = maxIndex + 1;
    }

    const question = await this.questionRepo.create({
      template_id: templateId,
      question_text: body.questionText,
      question_type: body.questionType as QuestionType,
      is_required: body.isRequired ?? true,
      order_index: orderIndex,
      config: (body.config as QuestionConfig) || null,
    });

    // Update template's updated_at
    await this.templateRepo.updateById(templateId, {});

    return {
      data: this.mapQuestionToDTO(question),
    };
  }

  async updateQuestion(
    req: Request & { user: AuthUser },
    templateId: string,
    questionId: string,
    body: UpdateQuestionBody,
  ): Promise<QuestionResponse> {
    const template = await this.templateRepo.findById(templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.coach_id !== req.user.id) {
      throw new ForbiddenException('You can only modify your own templates');
    }

    const question = await this.questionRepo.findById(questionId);
    if (!question || question.template_id !== templateId) {
      throw new NotFoundException('Question not found in this template');
    }

    const updateData: Record<string, unknown> = {};
    if (body.questionText !== undefined) updateData.question_text = body.questionText;
    if (body.questionType !== undefined) updateData.question_type = body.questionType;
    if (body.isRequired !== undefined) updateData.is_required = body.isRequired;
    if (body.config !== undefined) updateData.config = body.config;

    const updated = await this.questionRepo.updateById(questionId, updateData);

    // Update template's updated_at
    await this.templateRepo.updateById(templateId, {});

    return {
      data: this.mapQuestionToDTO(updated!),
    };
  }

  async deleteQuestion(req: Request & { user: AuthUser }, templateId: string, questionId: string): Promise<void> {
    const template = await this.templateRepo.findById(templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.coach_id !== req.user.id) {
      throw new ForbiddenException('You can only modify your own templates');
    }

    const question = await this.questionRepo.findById(questionId);
    if (!question || question.template_id !== templateId) {
      throw new NotFoundException('Question not found in this template');
    }

    await this.questionRepo.deleteById(questionId);

    // Update template's updated_at
    await this.templateRepo.updateById(templateId, {});
  }

  async reorderQuestions(
    req: Request & { user: AuthUser },
    templateId: string,
    body: ReorderQuestionsBody,
  ): Promise<QuestionnaireTemplateResponse> {
    const template = await this.templateRepo.findById(templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.coach_id !== req.user.id) {
      throw new ForbiddenException('You can only modify your own templates');
    }

    const existingQuestions = await this.questionRepo.findByTemplateId(templateId);
    const existingIds = new Set(existingQuestions.map((q) => q.id));

    // Validate all IDs exist in this template
    for (const id of body.questionIds) {
      if (!existingIds.has(id)) {
        throw new BadRequestException(`Question ${id} not found in this template`);
      }
    }

    // Update order indexes
    const updates = body.questionIds.map((id, index) => ({
      id,
      orderIndex: index,
    }));
    await this.questionRepo.updateOrderIndexes(updates);

    // Fetch updated questions
    const questions = await this.questionRepo.findByTemplateId(templateId);

    // Update template's updated_at
    await this.templateRepo.updateById(templateId, {});

    return {
      data: this.mapTemplateToDTO(template, questions),
    };
  }

  // Helper methods
  private async getQuestionCounts(templateIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (templateIds.length === 0) return counts;

    for (const id of templateIds) {
      const questions = await this.questionRepo.findByTemplateId(id);
      counts.set(id, questions.length);
    }
    return counts;
  }

  private mapTemplateToDTO(
    template: QuestionnaireTemplate,
    questions?: QuestionnaireQuestion[],
    questionCount?: number,
  ): QuestionnaireTemplateDTO {
    return {
      id: template.id,
      coachId: template.coach_id,
      name: template.name,
      description: template.description,
      category: template.category,
      isArchived: template.is_archived,
      questions: questions?.map((q) => this.mapQuestionToDTO(q)),
      questionCount: questions?.length ?? questionCount,
      createdAt: template.created_at instanceof Date ? template.created_at.toISOString() : String(template.created_at),
      updatedAt: template.updated_at instanceof Date ? template.updated_at.toISOString() : String(template.updated_at),
    };
  }

  private mapQuestionToDTO(question: QuestionnaireQuestion): QuestionDTO {
    return {
      id: question.id,
      templateId: question.template_id,
      questionText: question.question_text,
      questionType: question.question_type,
      isRequired: question.is_required,
      orderIndex: question.order_index,
      config: question.config as any,
      createdAt: question.created_at instanceof Date ? question.created_at.toISOString() : String(question.created_at),
      updatedAt: question.updated_at instanceof Date ? question.updated_at.toISOString() : String(question.updated_at),
    };
  }
}
