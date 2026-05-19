import { Body, Controller, Get, HttpStatus, Param, Post, Query, Req, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { SkipActiveOrg } from 'src/modules/auth/guards/active-org.guard';

import { AdvancedMetricsApiService } from './advanced-metrics-api.service';
import {
  CorrelationQuery,
  DateQuery,
  FitnessFatiguePredictionBody,
  HistoryQuery,
  LthrHistoryQuery,
  LthrSportQuery,
  ManualLthrBody,
  ManualVo2MaxBody,
  ThresholdOverrideBody,
  Vo2MaxHistoryQuery,
  Vo2MaxSportQuery,
  WorkoutIdParam,
} from './request.dto';
import {
  BayesianDiagnosticsResponse,
  DailyReadinessResponse,
  EnhancedDailyReadinessResponse,
  FitnessFatiguePredictionResponse,
  FitnessFatigueResponse,
  HrvBaselineHistoryResponse,
  HrvBaselineResponse,
  LthrHistoryResponse,
  LthrResponse,
  LthrZonesResponse,
  MultiStreamLoadHistoryResponse,
  MultiStreamLoadResponse,
  ReadinessHistoryResponse,
  ReadinessTrendsResponse,
  RpeTssCorrelationResponse,
  ThresholdOverrideResponse,
  ThresholdsResponse,
  TrainingStressResponse,
  Vo2MaxHistoryResponse,
  Vo2MaxResponse,
  WellnessPerformanceCorrelationResponse,
} from './response.dto';

@ApiTags('advanced-metrics')
@ApiBearerAuth('JWT')
@Controller('advanced-metrics')
@SkipActiveOrg()
export class AdvancedMetricsApiController {
  constructor(private readonly service: AdvancedMetricsApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'Get current VO2 max estimation with fitness category' })
  @ApiResponse({ status: HttpStatus.OK, type: Vo2MaxResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('vo2max')
  async getVo2Max(@Req() req: Request & { user: AuthUser }, @Query() query: Vo2MaxSportQuery): Promise<Vo2MaxResponse> {
    return this.service.getVo2Max(req, query.sport);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get VO2 max history over time' })
  @ApiResponse({ status: HttpStatus.OK, type: Vo2MaxHistoryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('vo2max/history')
  async getVo2MaxHistory(
    @Req() req: Request & { user: AuthUser },
    @Query() query: Vo2MaxHistoryQuery,
  ): Promise<Vo2MaxHistoryResponse> {
    return this.service.getVo2MaxHistory(req, query.days, query.sport);
  }

  @Version('1')
  @ApiOperation({ summary: 'Trigger new VO2max estimation from recent workout data' })
  @ApiResponse({ status: HttpStatus.OK, type: Vo2MaxResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('vo2max/estimate')
  async estimateVo2Max(
    @Req() req: Request & { user: AuthUser },
    @Query() query: Vo2MaxSportQuery,
  ): Promise<Vo2MaxResponse> {
    return this.service.estimateVo2Max(req, query.sport);
  }

  @Version('1')
  @ApiOperation({ summary: 'Set manual VO2max override' })
  @ApiResponse({ status: HttpStatus.OK, type: Vo2MaxResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('vo2max/manual')
  async setManualVo2Max(
    @Req() req: Request & { user: AuthUser },
    @Body() body: ManualVo2MaxBody,
  ): Promise<Vo2MaxResponse> {
    return this.service.setManualVo2Max(req, body);
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

  @Version('1')
  @ApiOperation({ summary: 'Backfill fitness/fatigue history from existing workouts' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Backfill completed successfully' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('fitness-fatigue/backfill')
  async backfillFitnessFatigue(
    @Req() req: Request & { user: AuthUser },
    @Query() query: HistoryQuery,
  ): Promise<{ message: string }> {
    const days = query.days ?? 90;
    await this.service.backfillFitnessFatigue(req, days);
    return { message: `Successfully backfilled fitness/fatigue data for the last ${days} days` };
  }

  // ==========================================
  // Multi-Stream Load endpoints
  // ==========================================

  @Version('1')
  @ApiOperation({ summary: 'Get multi-stream training load for a specific date' })
  @ApiResponse({ status: HttpStatus.OK, type: MultiStreamLoadResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('multi-stream-load')
  async getMultiStreamLoad(
    @Req() req: Request & { user: AuthUser },
    @Query() query: DateQuery,
  ): Promise<MultiStreamLoadResponse> {
    return this.service.getMultiStreamLoad(req, query.date);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get multi-stream training load history' })
  @ApiResponse({ status: HttpStatus.OK, type: MultiStreamLoadHistoryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('multi-stream-load/history')
  async getMultiStreamLoadHistory(
    @Req() req: Request & { user: AuthUser },
    @Query() query: HistoryQuery,
  ): Promise<MultiStreamLoadHistoryResponse> {
    return this.service.getMultiStreamLoadHistory(req, query.days);
  }

  @Version('1')
  @ApiOperation({ summary: 'Backfill multi-stream load history from existing workouts' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Backfill completed successfully' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('multi-stream-load/backfill')
  async backfillMultiStreamLoad(
    @Req() req: Request & { user: AuthUser },
    @Query() query: HistoryQuery,
  ): Promise<{ message: string }> {
    const days = query.days ?? 90;
    await this.service.backfillMultiStreamLoad(req, days);
    return { message: `Successfully backfilled multi-stream load data for the last ${days} days` };
  }

  // ==========================================
  // HRV Baseline endpoints
  // ==========================================

  @Version('1')
  @ApiOperation({ summary: 'Get HRV baseline for a specific date' })
  @ApiResponse({ status: HttpStatus.OK, type: HrvBaselineResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('hrv-baseline')
  async getHrvBaseline(
    @Req() req: Request & { user: AuthUser },
    @Query() query: DateQuery,
  ): Promise<HrvBaselineResponse> {
    return this.service.getHrvBaseline(req, query.date);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get HRV baseline history' })
  @ApiResponse({ status: HttpStatus.OK, type: HrvBaselineHistoryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('hrv-baseline/history')
  async getHrvBaselineHistory(
    @Req() req: Request & { user: AuthUser },
    @Query() query: HistoryQuery,
  ): Promise<HrvBaselineHistoryResponse> {
    return this.service.getHrvBaselineHistory(req, query.days);
  }

  // ==========================================
  // Readiness endpoints
  // ==========================================

  @Version('1')
  @ApiOperation({ summary: 'Get daily readiness score for a specific date' })
  @ApiResponse({ status: HttpStatus.OK, type: DailyReadinessResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('readiness')
  async getDailyReadiness(
    @Req() req: Request & { user: AuthUser },
    @Query() query: DateQuery,
  ): Promise<DailyReadinessResponse> {
    return this.service.getDailyReadiness(req, query.date);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get readiness history' })
  @ApiResponse({ status: HttpStatus.OK, type: ReadinessHistoryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('readiness/history')
  async getReadinessHistory(
    @Req() req: Request & { user: AuthUser },
    @Query() query: HistoryQuery,
  ): Promise<ReadinessHistoryResponse> {
    return this.service.getReadinessHistory(req, query.days);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get readiness trends with divergence analysis' })
  @ApiResponse({ status: HttpStatus.OK, type: ReadinessTrendsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('readiness/trends')
  async getReadinessTrends(
    @Req() req: Request & { user: AuthUser },
    @Query() query: HistoryQuery,
  ): Promise<ReadinessTrendsResponse> {
    return this.service.getReadinessTrends(req, query.days ?? 14);
  }

  @Version('1')
  @ApiOperation({
    summary: 'Get enhanced readiness score (v2) with 4-block structure and confidence scores',
    description:
      'Enhanced readiness calculation using research-backed 4-block structure: Recovery (45-55%), Load (25-35%), Subjective (10-20%), Illness/Behavior (5-15%). Includes monotony/strain integration, illness override, explicit alcohol penalty, and confidence output.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: EnhancedDailyReadinessResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('readiness/enhanced')
  async getEnhancedDailyReadiness(
    @Req() req: Request & { user: AuthUser },
    @Query() query: DateQuery,
  ): Promise<EnhancedDailyReadinessResponse> {
    return this.service.getEnhancedDailyReadiness(req, query.date);
  }

  // ==========================================
  // Subjective-Load Correlation endpoints
  // ==========================================

  @Version('1')
  @ApiOperation({ summary: 'Get RPE vs calculated TSS correlation data' })
  @ApiResponse({ status: HttpStatus.OK, type: RpeTssCorrelationResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('rpe-tss-correlation')
  async getRpeTssCorrelation(
    @Req() req: Request & { user: AuthUser },
    @Query() query: CorrelationQuery,
  ): Promise<RpeTssCorrelationResponse> {
    return this.service.getRpeTssCorrelation(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get wellness-performance correlation and overtraining risk' })
  @ApiResponse({ status: HttpStatus.OK, type: WellnessPerformanceCorrelationResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('wellness-performance')
  async getWellnessPerformanceCorrelation(
    @Req() req: Request & { user: AuthUser },
    @Query() query: CorrelationQuery,
  ): Promise<WellnessPerformanceCorrelationResponse> {
    return this.service.getWellnessPerformanceCorrelation(req, query);
  }

  // ==========================================
  // Bayesian Diagnostics endpoint
  // ==========================================

  @Version('1')
  @ApiOperation({ summary: 'Get Bayesian model diagnostics for personalized load parameters' })
  @ApiResponse({ status: HttpStatus.OK, type: BayesianDiagnosticsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('bayesian-diagnostics')
  async getBayesianDiagnostics(@Req() req: Request & { user: AuthUser }): Promise<BayesianDiagnosticsResponse> {
    return this.service.getBayesianDiagnostics(req);
  }

  // ==========================================
  // LTHR (Lactate Threshold Heart Rate) endpoints
  // ==========================================

  @Version('1')
  @ApiOperation({ summary: 'Get current LTHR estimation' })
  @ApiResponse({ status: HttpStatus.OK, type: LthrResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('lthr')
  async getLTHR(@Req() req: Request & { user: AuthUser }, @Query() query: LthrSportQuery): Promise<LthrResponse> {
    return this.service.getLTHR(req, query.sport);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get LTHR history over time' })
  @ApiResponse({ status: HttpStatus.OK, type: LthrHistoryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('lthr/history')
  async getLTHRHistory(
    @Req() req: Request & { user: AuthUser },
    @Query() query: LthrHistoryQuery,
  ): Promise<LthrHistoryResponse> {
    return this.service.getLTHRHistory(req, query.days, query.sport);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get HR training zones based on LTHR' })
  @ApiResponse({ status: HttpStatus.OK, type: LthrZonesResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('lthr/zones')
  async getLTHRZones(
    @Req() req: Request & { user: AuthUser },
    @Query() query: LthrSportQuery,
  ): Promise<LthrZonesResponse> {
    return this.service.getLTHRZones(req, query.sport);
  }

  @Version('1')
  @ApiOperation({ summary: 'Trigger new LTHR estimation from recent workout data' })
  @ApiResponse({ status: HttpStatus.OK, type: LthrResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('lthr/estimate')
  async estimateLTHR(@Req() req: Request & { user: AuthUser }, @Query() query: LthrSportQuery): Promise<LthrResponse> {
    return this.service.estimateLTHR(req, query.sport);
  }

  @Version('1')
  @ApiOperation({ summary: 'Set manual LTHR override' })
  @ApiResponse({ status: HttpStatus.OK, type: LthrResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('lthr/manual')
  async setManualLTHR(@Req() req: Request & { user: AuthUser }, @Body() body: ManualLthrBody): Promise<LthrResponse> {
    return this.service.setManualLTHR(req, body);
  }
}
