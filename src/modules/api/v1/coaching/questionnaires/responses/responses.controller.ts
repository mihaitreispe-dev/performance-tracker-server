import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Version,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { InstanceIdParam, ListMyQuestionnairesQuery, SaveResponsesBody } from './request.dto';
import { AthleteQuestionnaireListResponse, AthleteQuestionnaireResponse, SubmitResponse } from './response.dto';
import { ResponsesService } from './responses.service';

@ApiTags('coaching/questionnaires/athlete')
@ApiBearerAuth('JWT')
@Controller('coaching/my-coach/questionnaires')
export class ResponsesController {
  constructor(private readonly service: ResponsesService) {}

  // List athlete's questionnaires
  @Version('1')
  @ApiOperation({ summary: 'List questionnaires assigned to the current user' })
  @ApiResponse({ status: HttpStatus.OK, type: AthleteQuestionnaireListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get()
  async listMyQuestionnaires(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListMyQuestionnairesQuery,
  ): Promise<AthleteQuestionnaireListResponse> {
    return this.service.listMyQuestionnaires(req, query);
  }

  // Get questionnaire to fill
  @Version('1')
  @ApiOperation({ summary: 'Get a questionnaire to fill out' })
  @ApiResponse({ status: HttpStatus.OK, type: AthleteQuestionnaireResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not assigned to you' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Get(':id')
  async getQuestionnaireToFill(
    @Req() req: Request & { user: AuthUser },
    @Param() params: InstanceIdParam,
  ): Promise<AthleteQuestionnaireResponse> {
    return this.service.getQuestionnaireToFill(req, params.id);
  }

  // Start questionnaire (mark as in_progress)
  @Version('1')
  @ApiOperation({ summary: 'Mark questionnaire as started' })
  @ApiResponse({ status: HttpStatus.OK, type: AthleteQuestionnaireResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not assigned to you' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Already completed or expired' })
  @Post(':id/start')
  async startQuestionnaire(
    @Req() req: Request & { user: AuthUser },
    @Param() params: InstanceIdParam,
  ): Promise<AthleteQuestionnaireResponse> {
    return this.service.startQuestionnaire(req, params.id);
  }

  // Save responses (draft/partial save)
  @Version('1')
  @ApiOperation({ summary: 'Save responses (can be partial, allows resuming later)' })
  @ApiResponse({ status: HttpStatus.OK, type: AthleteQuestionnaireResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not assigned to you' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Already completed or expired' })
  @Put(':id/responses')
  async saveResponses(
    @Req() req: Request & { user: AuthUser },
    @Param() params: InstanceIdParam,
    @Body() body: SaveResponsesBody,
  ): Promise<AthleteQuestionnaireResponse> {
    return this.service.saveResponses(req, params.id, body);
  }

  // Submit questionnaire (final submission)
  @Version('1')
  @ApiOperation({ summary: 'Submit completed questionnaire' })
  @ApiResponse({ status: HttpStatus.OK, type: SubmitResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not assigned to you' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Missing required responses' })
  @Post(':id/submit')
  async submitQuestionnaire(
    @Req() req: Request & { user: AuthUser },
    @Param() params: InstanceIdParam,
  ): Promise<SubmitResponse> {
    return this.service.submitQuestionnaire(req, params.id);
  }
}
