import { Body, Controller, Get, HttpStatus, Param, Post, Query, Req, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AdvancedMetricsApiService } from './advanced-metrics-api.service';
import {
  HistoryQuery,
  WorkoutIdParam,
  ThresholdOverrideBody,
  FitnessFatiguePredictionBody,
} from './request.dto';
import {
  Vo2MaxResponse,
  Vo2MaxHistoryResponse,
  FitnessFatigueResponse,
  TrainingStressResponse,
  ThresholdsResponse,
  ThresholdOverrideResponse,
  FitnessFatiguePredictionResponse,
} from './response.dto';

@ApiTags('advanced-metrics')
@ApiBearerAuth('JWT')
@Controller('advanced-metrics')
export class AdvancedMetricsApiController {
  constructor(private readonly service: AdvancedMetricsApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'Get current VO2 max estimation with fitness category' })
  @ApiResponse({ status: HttpStatus.OK, type: Vo2MaxResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('vo2max')
  async getVo2Max(@Req() req: Request & { user: AuthUser }): Promise<Vo2MaxResponse> {
    return this.service.getVo2Max(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get VO2 max history over time' })
  @ApiResponse({ status: HttpStatus.OK, type: Vo2MaxHistoryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('vo2max/history')
  async getVo2MaxHistory(
    @Req() req: Request & { user: AuthUser },
    @Query() query: HistoryQuery,
  ): Promise<Vo2MaxHistoryResponse> {
    return this.service.getVo2MaxHistory(req, query.days);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get fitness/fatigue chart data (PMC)' })
  @ApiResponse({ status: HttpStatus.OK, type: FitnessFatigueResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('fitness-fatigue')
  async getFitnessFatigue(
    @Req() req: Request & { user: AuthUser },
    @Query() query: HistoryQuery,
  ): Promise<FitnessFatigueResponse> {
    return this.service.getFitnessFatigue(req, query.days);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get training stress breakdown for a specific workout' })
  @ApiResponse({ status: HttpStatus.OK, type: TrainingStressResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Workout not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('training-stress/:workoutId')
  async getWorkoutTrainingStress(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutIdParam,
  ): Promise<TrainingStressResponse> {
    return this.service.getWorkoutTrainingStress(req, params.workoutId);
  }

  @Version('1')
  @ApiOperation({ summary: 'Recalculate training stress for a workout' })
  @ApiResponse({ status: HttpStatus.OK, type: TrainingStressResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Workout not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('training-stress/:workoutId/recalculate')
  async recalculateWorkoutStress(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutIdParam,
  ): Promise<TrainingStressResponse> {
    return this.service.recalculateWorkoutStress(req, params.workoutId);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get all fitness thresholds (LTHR, LTP, FTP, etc.)' })
  @ApiResponse({ status: HttpStatus.OK, type: ThresholdsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('thresholds')
  async getThresholds(@Req() req: Request & { user: AuthUser }): Promise<ThresholdsResponse> {
    return this.service.getThresholds(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Manually override a threshold value' })
  @ApiResponse({ status: HttpStatus.OK, type: ThresholdOverrideResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('thresholds')
  async overrideThreshold(
    @Req() req: Request & { user: AuthUser },
    @Body() body: ThresholdOverrideBody,
  ): Promise<ThresholdOverrideResponse> {
    return this.service.overrideThreshold(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Predict future fitness/fatigue based on planned training' })
  @ApiResponse({ status: HttpStatus.OK, type: FitnessFatiguePredictionResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('fitness-fatigue/predict')
  async predictFitnessFatigue(
    @Req() req: Request & { user: AuthUser },
    @Body() body: FitnessFatiguePredictionBody,
  ): Promise<FitnessFatiguePredictionResponse> {
    return this.service.predictFitnessFatigue(req, body);
  }
}
