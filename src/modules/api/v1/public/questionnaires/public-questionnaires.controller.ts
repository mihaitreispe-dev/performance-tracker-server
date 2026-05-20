import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import type { ApiKeyContext } from 'src/modules/auth/api-key/api-key.guard';
import { PublicApiRoute } from 'src/modules/auth/api-key/public-api-route.decorator';

import { PublicQuestionnairesService } from './public-questionnaires.service';
import {
  ClientIdParam,
  CreateOnboardingQuestionnaireBody,
  ListQuestionnairesQuery,
  QuestionnaireIdParam,
  SubmitResponseBody,
  UpdateOnboardingQuestionnaireBody,
  UserIdParam,
} from './request.dto';
import {
  GeneratedWorkoutResponse,
  OnboardingQuestionnaireListResponse,
  OnboardingQuestionnaireResponse,
  OnboardingResponseList,
  OnboardingResponseSingle,
} from './response.dto';

type PublicRequest = Request & { apiKey: ApiKeyContext };

@ApiTags('Public')
@ApiSecurity('apiKey')
@Controller('public')
export class PublicQuestionnairesController {
  constructor(private readonly service: PublicQuestionnairesService) {}

  // -------- Questionnaires CRUD --------

  @Get('questionnaires')
  @PublicApiRoute('questionnaires:read')
  @ApiOperation({ summary: "List the organisation's onboarding questionnaires." })
  @ApiOkResponse({ type: OnboardingQuestionnaireListResponse })
  async list(
    @Req() req: PublicRequest,
    @Query() query: ListQuestionnairesQuery,
  ): Promise<OnboardingQuestionnaireListResponse> {
    return this.service.list(req.apiKey.organisationId, query);
  }

  @Get('questionnaires/:id')
  @PublicApiRoute('questionnaires:read')
  @ApiOperation({ summary: 'Fetch a single questionnaire definition.' })
  @ApiOkResponse({ type: OnboardingQuestionnaireResponse })
  async getById(
    @Req() req: PublicRequest,
    @Param() params: QuestionnaireIdParam,
  ): Promise<OnboardingQuestionnaireResponse> {
    return this.service.getById(req.apiKey.organisationId, params.id);
  }

  @Post('questionnaires')
  @PublicApiRoute('questionnaires:write')
  @ApiOperation({ summary: 'Create a new onboarding questionnaire.' })
  @ApiCreatedResponse({ type: OnboardingQuestionnaireResponse })
  async create(
    @Req() req: PublicRequest,
    @Body() body: CreateOnboardingQuestionnaireBody,
  ): Promise<OnboardingQuestionnaireResponse> {
    return this.service.create(req.apiKey.organisationId, body);
  }

  @Patch('questionnaires/:id')
  @PublicApiRoute('questionnaires:write')
  @ApiOperation({ summary: 'Update an existing questionnaire (rename, edit schema, publish/unpublish).' })
  @ApiOkResponse({ type: OnboardingQuestionnaireResponse })
  async update(
    @Req() req: PublicRequest,
    @Param() params: QuestionnaireIdParam,
    @Body() body: UpdateOnboardingQuestionnaireBody,
  ): Promise<OnboardingQuestionnaireResponse> {
    return this.service.update(req.apiKey.organisationId, params.id, body);
  }

  // -------- Responses --------

  @Post('questionnaires/:id/responses')
  @PublicApiRoute('responses:write')
  @ApiOperation({
    summary:
      "Submit a client's answers against a questionnaire. Derived tags are computed and stored alongside.",
  })
  @ApiCreatedResponse({ type: OnboardingResponseSingle })
  async submitResponse(
    @Req() req: PublicRequest,
    @Param() params: QuestionnaireIdParam,
    @Body() body: SubmitResponseBody,
  ): Promise<OnboardingResponseSingle> {
    return this.service.submitResponse(req.apiKey.organisationId, params.id, body);
  }

  @Get('responses/:userId')
  @PublicApiRoute('clients:read')
  @ApiOperation({ summary: "List a client's onboarding responses (newest first)." })
  @ApiOkResponse({ type: OnboardingResponseList })
  async listResponsesForUser(
    @Req() req: PublicRequest,
    @Param() params: UserIdParam,
  ): Promise<OnboardingResponseList> {
    return this.service.listResponsesForUser(req.apiKey.organisationId, params.userId);
  }

  // -------- Generation --------

  @Post('clients/:id/generated-workouts')
  @PublicApiRoute('workouts:generate')
  @ApiOperation({
    summary:
      "Generate a starter workout from the client's latest onboarding response. Returns the new workout id plus a transparency surface (level, goal, derived tags, chosen exercises).",
  })
  @ApiCreatedResponse({ type: GeneratedWorkoutResponse })
  async generate(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
  ): Promise<GeneratedWorkoutResponse> {
    return this.service.generateWorkoutForClient(req.apiKey.organisationId, params.id);
  }
}
