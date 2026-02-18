import { Controller, Get, HttpStatus, Param, Query, Req, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { AnalyticsApiService } from './analytics-api.service';
import { PeriodSummaryQuery, StrengthProgressionParam, StrengthProgressionQuery, TrainingLoadHistoryQuery, WeeklySummaryQuery, WorkoutAnalyticsParam } from './request.dto';
import {
  CurrentTrainingLoadResponse,
  PeriodSummaryResponse,
  RacePredictionsResponse,
  StreakResponse,
  StrengthProgressionResponse,
  TrackedExercisesResponse,
  TrainingLoadHistoryResponse,
  WeeklySummaryResponse,
  WorkoutAnalyticsResponse,
} from './response.dto';

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

  @Version('1')
  @ApiOperation({ summary: 'Get current training load and fatigue score' })
  @ApiResponse({ status: HttpStatus.OK, type: CurrentTrainingLoadResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('training-load')
  async getCurrentTrainingLoad(
    @Req() req: Request & { user: AuthUser },
  ): Promise<CurrentTrainingLoadResponse> {
    return this.service.getCurrentTrainingLoad(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get training load history for time graphs' })
  @ApiResponse({ status: HttpStatus.OK, type: TrainingLoadHistoryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('training-load/history')
  async getTrainingLoadHistory(
    @Req() req: Request & { user: AuthUser },
    @Query() query: TrainingLoadHistoryQuery,
  ): Promise<TrainingLoadHistoryResponse> {
    return this.service.getTrainingLoadHistory(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get workout streak information' })
  @ApiResponse({ status: HttpStatus.OK, type: StreakResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('streak')
  async getStreak(
    @Req() req: Request & { user: AuthUser },
  ): Promise<StreakResponse> {
    return this.service.getStreak(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get predicted race times based on running data' })
  @ApiResponse({ status: HttpStatus.OK, type: RacePredictionsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('race-predictions')
  async getRacePredictions(
    @Req() req: Request & { user: AuthUser },
  ): Promise<RacePredictionsResponse> {
    return this.service.getRacePredictions(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get exercises tracked with strength data' })
  @ApiResponse({ status: HttpStatus.OK, type: TrackedExercisesResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('strength/exercises')
  async getTrackedExercises(
    @Req() req: Request & { user: AuthUser },
  ): Promise<TrackedExercisesResponse> {
    return this.service.getTrackedExercises(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get strength progression data for an exercise' })
  @ApiResponse({ status: HttpStatus.OK, type: StrengthProgressionResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Exercise not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('strength/:exerciseId')
  async getStrengthProgression(
    @Req() req: Request & { user: AuthUser },
    @Param() params: StrengthProgressionParam,
    @Query() query: StrengthProgressionQuery,
  ): Promise<StrengthProgressionResponse> {
    return this.service.getStrengthProgression(req, params.exerciseId, query);
  }
}
