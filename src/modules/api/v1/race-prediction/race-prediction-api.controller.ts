import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Version,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { RacePredictionApiService } from './race-prediction-api.service';
import {
  GeneratePredictionBody,
  PredictionHistoryQuery,
  QuickPredictionBody,
  RecordRaceResultBody,
  TaperPlanQuery,
  UpdateProfileMetricsBody,
} from './request.dto';
import {
  AthleteProfileMetricsDTO,
  HistoricalRaceResultDTO,
  PredictionAccuracyStatsDTO,
  RacePredictionDTO,
  TaperPlanDTO,
} from './response.dto';

@ApiTags('Race Predictions')
@ApiBearerAuth('JWT')
@Controller()
export class RacePredictionApiController {
  constructor(private readonly service: RacePredictionApiService) {}

  // ==========================================================================
  // Predictions for Registered Races
  // ==========================================================================

  @Version('1')
  @Post('users/:userId/races/:raceId/prediction')
  @ApiOperation({ summary: 'Generate prediction for a registered race' })
  @ApiResponse({ status: 201, type: RacePredictionDTO })
  async generatePrediction(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Param('raceId') raceId: string,
    @Body() body: GeneratePredictionBody,
  ): Promise<RacePredictionDTO> {
    return this.service.generatePrediction(req, raceId, body);
  }

  @Version('1')
  @Get('users/:userId/races/:raceId/prediction')
  @ApiOperation({ summary: 'Get existing prediction for a race' })
  @ApiResponse({ status: 200, type: RacePredictionDTO })
  async getPrediction(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Param('raceId') raceId: string,
  ): Promise<RacePredictionDTO> {
    return this.service.getPrediction(req, raceId);
  }

  // ==========================================================================
  // Quick Predictions
  // ==========================================================================

  @Version('1')
  @Post('users/:userId/predictions/quick')
  @ApiOperation({ summary: 'Generate quick prediction for any distance' })
  @ApiResponse({ status: 201, type: RacePredictionDTO })
  async quickPrediction(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Body() body: QuickPredictionBody,
  ): Promise<RacePredictionDTO> {
    return this.service.quickPrediction(req, body);
  }

  // ==========================================================================
  // Prediction History
  // ==========================================================================

  @Version('1')
  @Get('users/:userId/predictions')
  @ApiOperation({ summary: 'List prediction history' })
  @ApiResponse({ status: 200, type: [RacePredictionDTO] })
  async listPredictions(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Query() query: PredictionHistoryQuery,
  ): Promise<RacePredictionDTO[]> {
    return this.service.listPredictions(req, query);
  }

  // ==========================================================================
  // Race Results
  // ==========================================================================

  @Version('1')
  @Post('users/:userId/races/:raceId/result')
  @ApiOperation({ summary: 'Record actual race result' })
  @ApiResponse({ status: 201, type: HistoricalRaceResultDTO })
  async recordResult(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Param('raceId') raceId: string,
    @Body() body: RecordRaceResultBody,
  ): Promise<HistoricalRaceResultDTO> {
    return this.service.recordResult(req, raceId, body);
  }

  // ==========================================================================
  // Taper Plans
  // ==========================================================================

  @Version('1')
  @Get('users/:userId/races/:raceId/taper-plan')
  @ApiOperation({ summary: 'Get taper plan for a race' })
  @ApiResponse({ status: 200, type: TaperPlanDTO })
  async getTaperPlan(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Param('raceId') raceId: string,
    @Query() query: TaperPlanQuery,
  ): Promise<TaperPlanDTO> {
    return this.service.getTaperPlan(req, raceId, query);
  }

  // ==========================================================================
  // Athlete Profile Metrics
  // ==========================================================================

  @Version('1')
  @Patch('users/:userId/profile-metrics')
  @ApiOperation({ summary: 'Update athlete profile metrics' })
  @ApiResponse({ status: 200, type: AthleteProfileMetricsDTO })
  async updateProfileMetrics(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Body() body: UpdateProfileMetricsBody,
  ): Promise<AthleteProfileMetricsDTO> {
    return this.service.updateProfileMetrics(req, body);
  }

  @Version('1')
  @Get('users/:userId/profile-metrics')
  @ApiOperation({ summary: 'Get athlete profile metrics' })
  @ApiResponse({ status: 200, type: AthleteProfileMetricsDTO })
  async getProfileMetrics(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
  ): Promise<AthleteProfileMetricsDTO | null> {
    return this.service.getProfileMetrics(req);
  }

  // ==========================================================================
  // Prediction Accuracy Stats
  // ==========================================================================

  @Version('1')
  @Get('users/:userId/predictions/accuracy')
  @ApiOperation({ summary: 'Get prediction accuracy statistics' })
  @ApiResponse({ status: 200, type: PredictionAccuracyStatsDTO })
  async getAccuracyStats(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
  ): Promise<PredictionAccuracyStatsDTO> {
    return this.service.getAccuracyStats(req);
  }
}
