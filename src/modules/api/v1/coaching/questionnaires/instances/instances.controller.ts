import { Body, Controller, Get, HttpStatus, Param, Post, Query, Req, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { UserRole } from 'src/database/interfaces';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { InstancesService } from './instances.service';
import {
  AthleteIdParam,
  CompareQuestionnairesQuery,
  InstanceIdParam,
  ListAthleteQuestionnairesQuery,
  QuickCreateAndSendBody,
  SendQuestionnaireToAthleteBody,
  SendQuestionnaireToMultipleBody,
  TemplateIdWithAthleteParam,
} from './request.dto';
import {
  CompareQuestionnairesResponse,
  QuestionnaireInstanceListResponse,
  QuestionnaireInstanceResponse,
  SendQuestionnaireResponse,
} from './response.dto';

@ApiTags('coaching/questionnaires/instances')
@ApiBearerAuth('JWT')
@Controller('coaching')
export class InstancesController {
  constructor(private readonly service: InstancesService) {}

  // Send questionnaire to a specific athlete
  @Version('1')
  @ApiOperation({ summary: 'Send a questionnaire to an athlete (COACH only)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: QuestionnaireInstanceResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach or no relationship' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Template not found' })
  @Roles(UserRole.COACH)
  @Post('athletes/:athleteId/questionnaires')
  async sendToAthlete(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
    @Body() body: SendQuestionnaireToAthleteBody,
  ): Promise<QuestionnaireInstanceResponse> {
    return this.service.sendToAthlete(req, params.athleteId, body);
  }

  // Quick create and send (for one-off questionnaires from chat)
  @Version('1')
  @ApiOperation({ summary: 'Quick create and send a questionnaire (COACH only)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: QuestionnaireInstanceResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach or no relationship' })
  @Roles(UserRole.COACH)
  @Post('athletes/:athleteId/questionnaires/quick')
  async quickCreateAndSend(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
    @Body() body: QuickCreateAndSendBody,
  ): Promise<QuestionnaireInstanceResponse> {
    return this.service.quickCreateAndSend(req, params.athleteId, body);
  }

  // Send template to multiple athletes
  @Version('1')
  @ApiOperation({ summary: 'Send a questionnaire template to multiple athletes (COACH only)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: SendQuestionnaireResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not owner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Template not found' })
  @Roles(UserRole.COACH)
  @Post('questionnaires/templates/:id/send')
  async sendToMultiple(
    @Req() req: Request & { user: AuthUser },
    @Param() params: TemplateIdWithAthleteParam,
    @Body() body: SendQuestionnaireToMultipleBody,
  ): Promise<SendQuestionnaireResponse> {
    return this.service.sendToMultiple(req, params.id, body);
  }

  // List questionnaires for an athlete
  @Version('1')
  @ApiOperation({ summary: 'List questionnaires sent to an athlete (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: QuestionnaireInstanceListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'No relationship' })
  @Roles(UserRole.COACH)
  @Get('athletes/:athleteId/questionnaires')
  async listAthleteQuestionnaires(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
    @Query() query: ListAthleteQuestionnairesQuery,
  ): Promise<QuestionnaireInstanceListResponse> {
    return this.service.listAthleteQuestionnaires(req, params.athleteId, query);
  }

  // Get a specific instance
  @Version('1')
  @ApiOperation({ summary: 'Get a questionnaire instance with responses' })
  @ApiResponse({ status: HttpStatus.OK, type: QuestionnaireInstanceResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'No access' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Get('questionnaires/instances/:id')
  async getInstanceById(
    @Req() req: Request & { user: AuthUser },
    @Param() params: InstanceIdParam,
  ): Promise<QuestionnaireInstanceResponse> {
    return this.service.getInstanceById(req, params.id);
  }

  // Send reminder
  @Version('1')
  @ApiOperation({ summary: 'Send a reminder for a pending questionnaire (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: QuestionnaireInstanceResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not owner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Already completed or expired' })
  @Roles(UserRole.COACH)
  @Post('questionnaires/instances/:id/remind')
  async sendReminder(
    @Req() req: Request & { user: AuthUser },
    @Param() params: InstanceIdParam,
  ): Promise<QuestionnaireInstanceResponse> {
    return this.service.sendReminder(req, params.id);
  }

  // Compare responses over time
  @Version('1')
  @ApiOperation({ summary: 'Compare questionnaire responses over time (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: CompareQuestionnairesResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'No relationship' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Not enough data to compare' })
  @Roles(UserRole.COACH)
  @Get('athletes/:athleteId/questionnaires/compare')
  async compareResponses(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
    @Query() query: CompareQuestionnairesQuery,
  ): Promise<CompareQuestionnairesResponse> {
    return this.service.compareResponses(req, params.athleteId, query);
  }
}
