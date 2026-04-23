import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Version,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { UserRole } from 'src/database/interfaces';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import {
  AddQuestionBody,
  CreateQuestionnaireTemplateBody,
  ListTemplatesQuery,
  QuestionIdParam,
  ReorderQuestionsBody,
  TemplateIdParam,
  UpdateQuestionBody,
  UpdateQuestionnaireTemplateBody,
} from './request.dto';
import { QuestionnaireTemplateListResponse, QuestionnaireTemplateResponse, QuestionResponse } from './response.dto';
import { TemplatesService } from './templates.service';

@ApiTags('coaching/questionnaires/templates')
@ApiBearerAuth('JWT')
@Controller('coaching/questionnaires/templates')
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Version('1')
  @ApiOperation({ summary: 'Create a questionnaire template (COACH only)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: QuestionnaireTemplateResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach' })
  @Roles(UserRole.COACH)
  @Post()
  async create(
    @Req() req: Request & { user: AuthUser },
    @Body() body: CreateQuestionnaireTemplateBody,
  ): Promise<QuestionnaireTemplateResponse> {
    return this.service.create(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'List questionnaire templates (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: QuestionnaireTemplateListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach' })
  @Roles(UserRole.COACH)
  @Get()
  async list(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListTemplatesQuery,
  ): Promise<QuestionnaireTemplateListResponse> {
    return this.service.list(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get a questionnaire template with questions (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: QuestionnaireTemplateResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not owner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Roles(UserRole.COACH)
  @Get(':id')
  async getById(
    @Req() req: Request & { user: AuthUser },
    @Param() params: TemplateIdParam,
  ): Promise<QuestionnaireTemplateResponse> {
    return this.service.getById(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update a questionnaire template (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: QuestionnaireTemplateResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not owner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Roles(UserRole.COACH)
  @Patch(':id')
  async update(
    @Req() req: Request & { user: AuthUser },
    @Param() params: TemplateIdParam,
    @Body() body: UpdateQuestionnaireTemplateBody,
  ): Promise<QuestionnaireTemplateResponse> {
    return this.service.update(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Archive a questionnaire template (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: QuestionnaireTemplateResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not owner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Roles(UserRole.COACH)
  @Delete(':id')
  async archive(
    @Req() req: Request & { user: AuthUser },
    @Param() params: TemplateIdParam,
  ): Promise<QuestionnaireTemplateResponse> {
    return this.service.archive(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Duplicate a questionnaire template (COACH only)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: QuestionnaireTemplateResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not owner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Roles(UserRole.COACH)
  @Post(':id/duplicate')
  async duplicate(
    @Req() req: Request & { user: AuthUser },
    @Param() params: TemplateIdParam,
  ): Promise<QuestionnaireTemplateResponse> {
    return this.service.duplicate(req, params.id);
  }

  // Question endpoints
  @Version('1')
  @ApiOperation({ summary: 'Add a question to a template (COACH only)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: QuestionResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not owner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Template not found' })
  @Roles(UserRole.COACH)
  @Post(':id/questions')
  async addQuestion(
    @Req() req: Request & { user: AuthUser },
    @Param() params: TemplateIdParam,
    @Body() body: AddQuestionBody,
  ): Promise<QuestionResponse> {
    return this.service.addQuestion(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update a question (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: QuestionResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not owner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Roles(UserRole.COACH)
  @Patch(':id/questions/:questionId')
  async updateQuestion(
    @Req() req: Request & { user: AuthUser },
    @Param() params: QuestionIdParam,
    @Body() body: UpdateQuestionBody,
  ): Promise<QuestionResponse> {
    return this.service.updateQuestion(req, params.id, params.questionId, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Delete a question (COACH only)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not owner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Roles(UserRole.COACH)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/questions/:questionId')
  async deleteQuestion(@Req() req: Request & { user: AuthUser }, @Param() params: QuestionIdParam): Promise<void> {
    return this.service.deleteQuestion(req, params.id, params.questionId);
  }

  @Version('1')
  @ApiOperation({ summary: 'Reorder questions in a template (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: QuestionnaireTemplateResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not owner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Invalid question IDs' })
  @Roles(UserRole.COACH)
  @Post(':id/questions/reorder')
  async reorderQuestions(
    @Req() req: Request & { user: AuthUser },
    @Param() params: TemplateIdParam,
    @Body() body: ReorderQuestionsBody,
  ): Promise<QuestionnaireTemplateResponse> {
    return this.service.reorderQuestions(req, params.id, body);
  }
}
