import { Controller, Get, HttpStatus, Param, Query, Req, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { SkipActiveOrg } from 'src/modules/auth/guards/active-org.guard';

import { ExploreApiService } from './explore-api.service';
import { MetricHistoryQuery, MetricIdParam, PeriodComparisonQuery } from './request.dto';
import { AvailableMetricsResponse, MetricHistoryResponse, PeriodComparisonResponse } from './response.dto';

@ApiTags('explore')
@ApiBearerAuth('JWT')
@Controller('explore')
@SkipActiveOrg()
export class ExploreApiController {
  constructor(private readonly exploreService: ExploreApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'Get available metrics for exploration' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Available metrics with chapters',
    type: AvailableMetricsResponse,
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse })
  @Get('metrics')
  async getAvailableMetrics(): Promise<AvailableMetricsResponse> {
    return this.exploreService.getAvailableMetrics();
  }

  @Version('1')
  @ApiOperation({ summary: 'Get metric history for a specific metric' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Metric history data',
    type: MetricHistoryResponse,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse })
  @Get('metrics/:metricId/history')
  async getMetricHistory(
    @Req() req: Request & { user: AuthUser },
    @Param() params: MetricIdParam,
    @Query() query: MetricHistoryQuery,
  ): Promise<MetricHistoryResponse> {
    return this.exploreService.getMetricHistory(req, params.metricId, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get period comparison for workout summary' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Period comparison data',
    type: PeriodComparisonResponse,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse })
  @Get('period-comparison')
  async getPeriodComparison(
    @Req() req: Request & { user: AuthUser },
    @Query() query: PeriodComparisonQuery,
  ): Promise<PeriodComparisonResponse> {
    return this.exploreService.getPeriodComparison(req, query);
  }
}
