import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
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

import { PublicCardioService } from './public-cardio.service';
import {
  CardioMetricsBatchBody,
  ExecutionIdParam,
  ListCardioMetricsQuery,
  UploadRouteBody,
} from './request.dto';
import {
  PublicCardioMetricListResponse,
  PublicCardioMetricsBatchResponse,
  PublicExecutionWeatherResponse,
  PublicWorkoutRouteResponse,
} from './response.dto';

type PublicRequest = Request & { apiKey: ApiKeyContext };

@ApiTags('Public')
@ApiSecurity('apiKey')
@Controller('public/workout-executions')
export class PublicCardioController {
  constructor(private readonly service: PublicCardioService) {}

  // -------- Routes --------

  @Post(':id/route')
  @PublicApiRoute('cardio:write')
  @ApiOperation({
    summary:
      "Upload the GPS route for this execution. One route per execution; uploads to an execution that already has a route are rejected with 400.",
  })
  @ApiCreatedResponse({ type: PublicWorkoutRouteResponse })
  async uploadRoute(
    @Req() req: PublicRequest,
    @Param() params: ExecutionIdParam,
    @Body() body: UploadRouteBody,
  ): Promise<PublicWorkoutRouteResponse> {
    return this.service.uploadRoute(req.apiKey.organisationId, params.id, body);
  }

  @Get(':id/route')
  @PublicApiRoute('cardio:read')
  @ApiOperation({ summary: 'Fetch the GPS route + markers for an execution.' })
  @ApiOkResponse({ type: PublicWorkoutRouteResponse })
  async getRoute(
    @Req() req: PublicRequest,
    @Param() params: ExecutionIdParam,
  ): Promise<PublicWorkoutRouteResponse> {
    return this.service.getRoute(req.apiKey.organisationId, params.id);
  }

  // -------- Cardio metric streams --------

  @Post(':id/cardio-metrics')
  @PublicApiRoute('cardio:write')
  @ApiOperation({
    summary:
      'Batch-upload cardio metric samples (HR, pace, cadence, power, ...). Max 50,000 samples per call — chunk longer activities.',
  })
  @ApiCreatedResponse({ type: PublicCardioMetricsBatchResponse })
  async uploadCardioMetrics(
    @Req() req: PublicRequest,
    @Param() params: ExecutionIdParam,
    @Body() body: CardioMetricsBatchBody,
  ): Promise<PublicCardioMetricsBatchResponse> {
    return this.service.uploadCardioMetrics(req.apiKey.organisationId, params.id, body);
  }

  @Get(':id/cardio-metrics')
  @PublicApiRoute('cardio:read')
  @ApiOperation({ summary: 'Read cardio metric samples for an execution. Filter by metricType.' })
  @ApiOkResponse({ type: PublicCardioMetricListResponse })
  async listCardioMetrics(
    @Req() req: PublicRequest,
    @Param() params: ExecutionIdParam,
    @Query() query: ListCardioMetricsQuery,
  ): Promise<PublicCardioMetricListResponse> {
    return this.service.listCardioMetrics(req.apiKey.organisationId, params.id, query);
  }

  // -------- Weather --------

  @Get(':id/weather')
  @PublicApiRoute('cardio:read')
  @ApiOperation({ summary: 'Weather snapshot at the execution location + start time.' })
  @ApiOkResponse({ type: PublicExecutionWeatherResponse })
  async getWeather(
    @Req() req: PublicRequest,
    @Param() params: ExecutionIdParam,
  ): Promise<PublicExecutionWeatherResponse> {
    return this.service.getWeather(req.apiKey.organisationId, params.id);
  }
}
