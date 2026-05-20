import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
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

import { PublicWellnessService } from './public-wellness.service';
import {
  ClientIdParam,
  ExecutionIdParam,
  ListDateRangeQuery,
  PainLogBody,
  RecoveryJournalBody,
  SleepLogBody,
  UpdateProfileMetricsBody,
  UpsertNutritionGoalsBody,
  UpsertNutritionSummaryBody,
  WellnessCheckinBody,
} from './request.dto';
import {
  PublicNutritionGoalsResponse,
  PublicNutritionSummaryListResponse,
  PublicNutritionSummaryResponse,
  PublicPainLogListResponse,
  PublicPainLogResponse,
  PublicProfileMetricsResponse,
  PublicRecoveryEntryListResponse,
  PublicRecoveryEntryResponse,
  PublicSleepLogListResponse,
  PublicSleepLogResponse,
  PublicWellnessCheckinListResponse,
  PublicWellnessCheckinResponse,
} from './response.dto';

type PublicRequest = Request & { apiKey: ApiKeyContext };

@ApiTags('Public')
@ApiSecurity('apiKey')
@Controller('public')
export class PublicWellnessController {
  constructor(private readonly service: PublicWellnessService) {}

  // ---- Profile metrics ----

  @Get('clients/:id/profile-metrics')
  @PublicApiRoute('wellness:read')
  @ApiOperation({ summary: "Read the client's profile (weight, height, birth date, gender, etc.)" })
  @ApiOkResponse({ type: PublicProfileMetricsResponse })
  async getProfileMetrics(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
  ): Promise<PublicProfileMetricsResponse> {
    return this.service.getProfileMetrics(req.apiKey.organisationId, params.id);
  }

  @Patch('clients/:id/profile-metrics')
  @PublicApiRoute('wellness:write')
  @ApiOperation({ summary: "Update the client's profile (any subset of fields; missing fields untouched)." })
  @ApiOkResponse({ type: PublicProfileMetricsResponse })
  async updateProfileMetrics(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
    @Body() body: UpdateProfileMetricsBody,
  ): Promise<PublicProfileMetricsResponse> {
    return this.service.updateProfileMetrics(req.apiKey.organisationId, params.id, body);
  }

  // ---- Sleep ----

  @Post('clients/:id/sleep-logs')
  @PublicApiRoute('wellness:write')
  @ApiOperation({ summary: 'Record a sleep log for the client.' })
  @ApiCreatedResponse({ type: PublicSleepLogResponse })
  async createSleepLog(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
    @Body() body: SleepLogBody,
  ): Promise<PublicSleepLogResponse> {
    return this.service.createSleepLog(req.apiKey.organisationId, params.id, body);
  }

  @Get('clients/:id/sleep-logs')
  @PublicApiRoute('wellness:read')
  @ApiOperation({ summary: "List the client's sleep logs, newest first. Supports date-range filtering." })
  @ApiOkResponse({ type: PublicSleepLogListResponse })
  async listSleepLogs(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
    @Query() query: ListDateRangeQuery,
  ): Promise<PublicSleepLogListResponse> {
    return this.service.listSleepLogs(req.apiKey.organisationId, params.id, query);
  }

  // ---- Pain ----

  @Post('workout-executions/:id/pain-logs')
  @PublicApiRoute('wellness:write')
  @ApiOperation({
    summary:
      'Record a pain log against a workout execution. The owning user is inferred from the execution; the API key must be in their org.',
  })
  @ApiCreatedResponse({ type: PublicPainLogResponse })
  async createPainLog(
    @Req() req: PublicRequest,
    @Param() params: ExecutionIdParam,
    @Body() body: PainLogBody,
  ): Promise<PublicPainLogResponse> {
    return this.service.createPainLog(req.apiKey.organisationId, params.id, body);
  }

  @Get('clients/:id/pain-logs')
  @PublicApiRoute('wellness:read')
  @ApiOperation({ summary: "List the client's pain logs across all their executions." })
  @ApiOkResponse({ type: PublicPainLogListResponse })
  async listPainLogs(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
    @Query() query: ListDateRangeQuery,
  ): Promise<PublicPainLogListResponse> {
    return this.service.listPainLogsForClient(req.apiKey.organisationId, params.id, query);
  }

  // ---- Recovery journal ----

  @Put('clients/:id/recovery-journal')
  @PublicApiRoute('wellness:write')
  @ApiOperation({
    summary:
      'Upsert a recovery journal entry by (user, entryDate). Pass partial data — only the supplied fields are written.',
  })
  @ApiOkResponse({ type: PublicRecoveryEntryResponse })
  async upsertRecovery(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
    @Body() body: RecoveryJournalBody,
  ): Promise<PublicRecoveryEntryResponse> {
    return this.service.upsertRecovery(req.apiKey.organisationId, params.id, body);
  }

  @Get('clients/:id/recovery-journal')
  @PublicApiRoute('wellness:read')
  @ApiOperation({ summary: "List the client's recovery journal entries, newest first." })
  @ApiOkResponse({ type: PublicRecoveryEntryListResponse })
  async listRecovery(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
    @Query() query: ListDateRangeQuery,
  ): Promise<PublicRecoveryEntryListResponse> {
    return this.service.listRecovery(req.apiKey.organisationId, params.id, query);
  }

  // ---- Wellness check-ins ----

  @Put('clients/:id/wellness-checkins')
  @PublicApiRoute('wellness:write')
  @ApiOperation({ summary: 'Upsert a quick wellness check-in by (user, checkinDate).' })
  @ApiOkResponse({ type: PublicWellnessCheckinResponse })
  async upsertCheckin(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
    @Body() body: WellnessCheckinBody,
  ): Promise<PublicWellnessCheckinResponse> {
    return this.service.upsertWellnessCheckin(req.apiKey.organisationId, params.id, body);
  }

  @Get('clients/:id/wellness-checkins')
  @PublicApiRoute('wellness:read')
  @ApiOperation({ summary: "List the client's quick wellness check-ins, newest first." })
  @ApiOkResponse({ type: PublicWellnessCheckinListResponse })
  async listCheckins(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
    @Query() query: ListDateRangeQuery,
  ): Promise<PublicWellnessCheckinListResponse> {
    return this.service.listWellnessCheckins(req.apiKey.organisationId, params.id, query);
  }

  // ---- Nutrition ----

  @Put('clients/:id/nutrition-summaries')
  @PublicApiRoute('wellness:write')
  @ApiOperation({
    summary:
      "Upsert the client's daily nutrition summary by (user, date). Aggregate macros — the integrator decides how to roll up meal-level data.",
  })
  @ApiOkResponse({ type: PublicNutritionSummaryResponse })
  async upsertNutritionSummary(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
    @Body() body: UpsertNutritionSummaryBody,
  ): Promise<PublicNutritionSummaryResponse> {
    return this.service.upsertNutritionSummary(req.apiKey.organisationId, params.id, body);
  }

  @Get('clients/:id/nutrition-summaries')
  @PublicApiRoute('wellness:read')
  @ApiOperation({ summary: "List the client's daily nutrition summaries. Defaults to the last 30 days." })
  @ApiOkResponse({ type: PublicNutritionSummaryListResponse })
  async listNutritionSummaries(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
    @Query() query: ListDateRangeQuery,
  ): Promise<PublicNutritionSummaryListResponse> {
    return this.service.listNutritionSummaries(req.apiKey.organisationId, params.id, query);
  }

  @Get('clients/:id/nutrition-goals')
  @PublicApiRoute('wellness:read')
  @ApiOperation({ summary: "Read the client's nutrition targets." })
  @ApiOkResponse({ type: PublicNutritionGoalsResponse })
  async getNutritionGoals(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
  ): Promise<PublicNutritionGoalsResponse> {
    return this.service.getNutritionGoals(req.apiKey.organisationId, params.id);
  }

  @Put('clients/:id/nutrition-goals')
  @PublicApiRoute('wellness:write')
  @ApiOperation({ summary: "Upsert the client's nutrition targets (absolute or weight-based)." })
  @ApiOkResponse({ type: PublicNutritionGoalsResponse })
  async upsertNutritionGoals(
    @Req() req: PublicRequest,
    @Param() params: ClientIdParam,
    @Body() body: UpsertNutritionGoalsBody,
  ): Promise<PublicNutritionGoalsResponse> {
    return this.service.upsertNutritionGoals(req.apiKey.organisationId, params.id, body);
  }
}
