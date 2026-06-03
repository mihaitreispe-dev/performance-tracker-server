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

import { PublicAthletesService } from './public-athletes.service';
import {
  ClientIdParam,
  CompletePublicSetBody,
  ExecutionIdParam,
  FinishExecutionBody,
  ListExecutionHistoryQuery,
  ListPendingNotificationsQuery,
  ListScheduledWorkoutsQuery,
  StartExecutionBody,
} from './request.dto';
import {
  PublicExecutionHistoryResponse,
  PublicExecutionSummaryResponse,
  PublicPendingNotificationsResponse,
  PublicPersonalRecordListResponse,
  PublicScheduledWorkoutListResponse,
  PublicSetCompletionResponse,
  PublicWorkoutExecutionResponse,
} from './response.dto';

type PublicRequest = Request & { apiKey: ApiKeyContext };

@ApiTags('Public')
@ApiSecurity('apiKey')
@Controller('public')
export class PublicAthletesController {
  constructor(private readonly service: PublicAthletesService) {}

  // -------- Schedules --------

  @Get('clients/:id/scheduled-workouts')
  @PublicApiRoute('schedules:read')
  @ApiOperation({
    summary:
      "List a client's scheduled workouts. Supports date-range filtering and a completed flag for splitting upcoming vs done.",
  })
  @ApiOkResponse({ type: PublicScheduledWorkoutListResponse })
  async listScheduledWorkouts(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
    @Query() query: ListScheduledWorkoutsQuery,
  ): Promise<PublicScheduledWorkoutListResponse> {
    return this.service.listScheduledWorkouts(req.apiKey.organisationId, params.id, query);
  }

  // -------- Workout executions --------

  @Post('clients/:id/workout-executions')
  @PublicApiRoute('executions:write')
  @ApiOperation({
    summary:
      'Start a workout execution. Pass workoutScheduleId to link the execution to a calendar slot; omit for ad-hoc.',
  })
  @ApiCreatedResponse({ type: PublicWorkoutExecutionResponse })
  async startExecution(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
    @Body() body: StartExecutionBody,
  ): Promise<PublicWorkoutExecutionResponse> {
    return this.service.startExecution(req.apiKey.organisationId, params.id, body);
  }

  @Post('workout-executions/:id/sets')
  @PublicApiRoute('executions:write')
  @ApiOperation({
    summary:
      'Record (or update) one set within an active execution. Idempotent on (exerciseInstanceId, setNumber).',
  })
  @ApiCreatedResponse({ type: PublicSetCompletionResponse })
  async completeSet(
    @Req() req: PublicRequest,
    @Param() params: ExecutionIdParam,
    @Body() body: CompletePublicSetBody,
  ): Promise<PublicSetCompletionResponse> {
    return this.service.completeSet(req.apiKey.organisationId, params.id, body);
  }

  @Patch('workout-executions/:id/finish')
  @PublicApiRoute('executions:write')
  @ApiOperation({
    summary:
      "Mark an execution as finished. Idempotent — a second call returns the existing row without mutating completed_at.",
  })
  @ApiOkResponse({ type: PublicWorkoutExecutionResponse })
  async finishExecution(
    @Req() req: PublicRequest,
    @Param() params: ExecutionIdParam,
    @Body() body: FinishExecutionBody,
  ): Promise<PublicWorkoutExecutionResponse> {
    return this.service.finishExecution(req.apiKey.organisationId, params.id, body);
  }

  @Get('workout-executions/:id/summary')
  @PublicApiRoute('executions:read')
  @ApiOperation({
    summary:
      'Aggregated stats for an execution: time, sets, exercises, completion ratio, RPE, volume, per-exercise breakdown.',
  })
  @ApiOkResponse({ type: PublicExecutionSummaryResponse })
  async getExecutionSummary(
    @Req() req: PublicRequest,
    @Param() params: ExecutionIdParam,
  ): Promise<PublicExecutionSummaryResponse> {
    return this.service.getExecutionSummary(req.apiKey.organisationId, params.id);
  }

  @Get('clients/:id/workout-history')
  @PublicApiRoute('executions:read')
  @ApiOperation({ summary: "List a client's workout executions, newest first." })
  @ApiOkResponse({ type: PublicExecutionHistoryResponse })
  async listExecutionHistory(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
    @Query() query: ListExecutionHistoryQuery,
  ): Promise<PublicExecutionHistoryResponse> {
    return this.service.listExecutionHistory(req.apiKey.organisationId, params.id, query);
  }

  // -------- Personal records --------

  @Get('clients/:id/personal-records')
  @PublicApiRoute('executions:read')
  @ApiOperation({ summary: "List a client's personal records across exercise types." })
  @ApiOkResponse({ type: PublicPersonalRecordListResponse })
  async listPersonalRecords(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
  ): Promise<PublicPersonalRecordListResponse> {
    return this.service.listPersonalRecords(req.apiKey.organisationId, params.id);
  }

  // -------- Pending notifications (F1c — integrator poll) -----------

  @Get('clients/:id/pending-notifications')
  @PublicApiRoute('notifications:write')
  @ApiOperation({
    summary:
      "Integrator-poll endpoint. Returns notifications queued for the client with route='external_app'. Pass `since=<last-seen sentAt>` as the watermark on subsequent polls.",
  })
  @ApiOkResponse({ type: PublicPendingNotificationsResponse })
  async listPendingNotifications(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
    @Query() query: ListPendingNotificationsQuery,
  ): Promise<PublicPendingNotificationsResponse> {
    return this.service.listPendingNotifications(
      req.apiKey.organisationId,
      params.id,
      query.since ?? null,
    );
  }
}
