import { Controller, Get, HttpStatus, Param, Query, Req, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { AnalyticsApiService } from './analytics-api.service';
import { PeriodSummaryQuery, WeeklySummaryQuery, WorkoutAnalyticsParam } from './request.dto';
import { PeriodSummaryResponse, WeeklySummaryResponse, WorkoutAnalyticsResponse } from './response.dto';

@ApiTags('analytics')
@ApiBearerAuth('JWT')
@Controller('analytics')
export class AnalyticsApiController {
  constructor(private readonly service: AnalyticsApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'Get weekly summary for calendar' })
  @ApiResponse({ status: HttpStatus.OK, type: WeeklySummaryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('weekly-summary')
  async getWeeklySummary(
    @Req() req: Request & { user: AuthUser },
    @Query() query: WeeklySummaryQuery,
  ): Promise<WeeklySummaryResponse> {
    return this.service.getWeeklySummary(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get detailed workout analytics' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutAnalyticsResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Execution not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('workout/:executionId')
  async getWorkoutAnalytics(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutAnalyticsParam,
  ): Promise<WorkoutAnalyticsResponse> {
    return this.service.getWorkoutAnalytics(req, params.executionId);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get period-based analytics summary' })
  @ApiResponse({ status: HttpStatus.OK, type: PeriodSummaryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('period-summary')
  async getPeriodSummary(
    @Req() req: Request & { user: AuthUser },
    @Query() query: PeriodSummaryQuery,
  ): Promise<PeriodSummaryResponse> {
    return this.service.getPeriodSummary(req, query);
  }
}
