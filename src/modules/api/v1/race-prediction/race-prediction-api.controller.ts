import {
  BadRequestException,
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
  UploadedFile,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { RacePredictionApiService } from './race-prediction-api.service';
import {
  CourseBasedPredictionBody,
  GeneratePredictionBody,
  GenerateRacePlanBody,
  PredictionHistoryQuery,
  QuickPredictionBody,
  RecordRaceResultBody,
  TaperPlanQuery,
  UpdateProfileMetricsBody,
} from './request.dto';
import {
  AthleteProfileMetricsDTO,
  CourseBasedPredictionDTO,
  HistoricalRaceResultDTO,
  PredictionAccuracyStatsDTO,
  RacePlanDTO,
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

  @Version('1')
  @Post('me/predictions/quick')
  @ApiOperation({ summary: 'Generate quick prediction for current user' })
  @ApiResponse({ status: 201, type: RacePredictionDTO })
  async quickPredictionMe(
    @Req() req: Request & { user: AuthUser },
    @Body() body: QuickPredictionBody,
  ): Promise<RacePredictionDTO> {
    return this.service.quickPrediction(req, body);
  }

  // ==========================================================================
  // Course-Based Predictions
  // ==========================================================================

  @Version('1')
  @Post('me/predictions/course')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
      fileFilter: (_req, file, callback) => {
        const allowedMimeTypes = [
          'application/gpx+xml',
          'application/xml',
          'text/xml',
          'application/octet-stream', // FIT files
        ];
        const allowedExtensions = ['.gpx', '.fit'];
        const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

        if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
          callback(null, true);
        } else {
          callback(new BadRequestException('Only GPX and FIT files are allowed'), false);
        }
      },
    }),
  )
  @ApiOperation({
    summary: 'Generate course-based prediction from GPX/FIT file',
    description:
      'Upload a GPX or FIT file containing a course with elevation data to get ' +
      'a grade-adjusted race prediction using the Minetti model.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Course file and prediction options',
    schema: {
      type: 'object',
      required: ['file', 'sport'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'GPX or FIT file with course elevation data',
        },
        sport: {
          type: 'string',
          enum: ['run'],
          description: 'Sport type (currently only running supported)',
        },
        distance_meters: {
          type: 'number',
          description: 'Override distance (if different from file)',
        },
        segment_distance_meters: {
          type: 'number',
          default: 1000,
          description: 'Segment size for splits (default: 1000m)',
        },
        apply_fade_factor: {
          type: 'boolean',
          default: false,
          description: 'Apply fade factor for longer races',
        },
        downhill_speed_cap_mps: {
          type: 'number',
          description: 'Max downhill speed in m/s (default: 4.17)',
        },
        smoothing_window_meters: {
          type: 'number',
          default: 100,
          description: 'Elevation smoothing window (default: 100m)',
        },
        race_date: {
          type: 'string',
          format: 'date',
          description: 'Target race date for TSB projection',
        },
      },
    },
  })
  @ApiResponse({ status: 201, type: CourseBasedPredictionDTO })
  @ApiResponse({ status: 400, description: 'Invalid file or insufficient data' })
  async courseBasedPrediction(
    @Req() req: Request & { user: AuthUser },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CourseBasedPredictionBody,
  ): Promise<CourseBasedPredictionDTO> {
    if (!file) {
      throw new BadRequestException('Course file is required');
    }
    return this.service.courseBasedPrediction(req, file, body);
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

  // ==========================================================================
  // Race Plans
  // ==========================================================================

  @Version('1')
  @Post('users/:userId/races/:raceId/plan')
  @ApiOperation({ summary: 'Generate comprehensive race execution plan' })
  @ApiResponse({ status: 201, type: RacePlanDTO })
  async generateRacePlan(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Param('raceId') raceId: string,
    @Body() body: GenerateRacePlanBody,
  ): Promise<RacePlanDTO> {
    return this.service.generateRacePlan(req, raceId, body);
  }

  @Version('1')
  @Get('users/:userId/races/:raceId/plan')
  @ApiOperation({ summary: 'Get active race execution plan' })
  @ApiResponse({ status: 200, type: RacePlanDTO })
  async getRacePlan(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Param('raceId') raceId: string,
  ): Promise<RacePlanDTO> {
    return this.service.getRacePlan(req, raceId);
  }

  @Version('1')
  @Patch('users/:userId/races/:raceId/plan/refresh-weather')
  @ApiOperation({ summary: 'Refresh weather forecast and regenerate plan' })
  @ApiResponse({ status: 200, type: RacePlanDTO })
  async refreshWeather(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Param('raceId') raceId: string,
  ): Promise<RacePlanDTO> {
    return this.service.refreshWeather(req, raceId);
  }
}
