import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { IntegrationProvider } from 'src/database/interfaces';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { DisableJwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { IntegrationsApiService } from './integrations-api.service';
import {
  GarminWebhookBody,
  OAuthCallbackQuery,
  TrainingPeaksSyncQuery,
} from './request.dto';
import {
  OAuthUrlResponse,
  TrainingPeaksSyncResponse,
  UserIntegrationListResponse,
  UserIntegrationResponse,
  WebhookAckResponse,
} from './response.dto';
import { TrainingPeaksService } from './trainingpeaks.service';

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsApiController {
  constructor(
    private readonly service: IntegrationsApiService,
    private readonly trainingPeaksService: TrainingPeaksService,
  ) {}

  // List user's integrations

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List user integrations' })
  @ApiResponse({ status: HttpStatus.OK, type: UserIntegrationListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get()
  async listIntegrations(@Req() req: Request & { user: AuthUser }): Promise<UserIntegrationListResponse> {
    return this.service.listIntegrations(req);
  }

  // Garmin OAuth

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get Garmin OAuth authorization URL' })
  @ApiResponse({ status: HttpStatus.OK, type: OAuthUrlResponse })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Garmin integration not available' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('garmin/auth')
  async getGarminAuthUrl(@Req() req: Request & { user: AuthUser }): Promise<OAuthUrlResponse> {
    return this.service.getGarminAuthUrl(req);
  }

  @Version('1')
  @DisableJwtAuthGuard()
  @ApiOperation({ summary: 'Garmin OAuth callback' })
  @ApiResponse({ status: HttpStatus.OK, type: UserIntegrationResponse })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Invalid callback' })
  @Get('garmin/callback')
  async handleGarminCallback(@Query() query: OAuthCallbackQuery): Promise<UserIntegrationResponse> {
    return this.service.handleGarminCallback(query);
  }

  @Version('1')
  @DisableJwtAuthGuard()
  @ApiOperation({ summary: 'Garmin webhook receiver' })
  @ApiResponse({ status: HttpStatus.OK, type: WebhookAckResponse })
  @Post('garmin/webhook')
  async handleGarminWebhook(@Body() body: GarminWebhookBody): Promise<WebhookAckResponse> {
    return this.service.handleGarminWebhook(body);
  }

  // TrainingPeaks OAuth

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get TrainingPeaks OAuth authorization URL' })
  @ApiResponse({ status: HttpStatus.OK, type: OAuthUrlResponse })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'TrainingPeaks not configured' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('trainingpeaks/auth')
  async getTrainingPeaksAuthUrl(@Req() req: Request & { user: AuthUser }): Promise<OAuthUrlResponse> {
    return this.trainingPeaksService.getAuthUrl(req);
  }

  @Version('1')
  @DisableJwtAuthGuard()
  @ApiOperation({ summary: 'TrainingPeaks OAuth callback' })
  @ApiResponse({ status: HttpStatus.OK, type: UserIntegrationResponse })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Invalid callback' })
  @Get('trainingpeaks/callback')
  async handleTrainingPeaksCallback(@Query() query: OAuthCallbackQuery): Promise<UserIntegrationResponse> {
    return this.trainingPeaksService.handleCallback(query);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Sync TrainingPeaks workouts' })
  @ApiResponse({ status: HttpStatus.OK, type: TrainingPeaksSyncResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'No TrainingPeaks integration found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized or token expired' })
  @Post('trainingpeaks/sync')
  async syncTrainingPeaksWorkouts(
    @Req() req: Request & { user: AuthUser },
    @Query() query: TrainingPeaksSyncQuery,
  ): Promise<TrainingPeaksSyncResponse> {
    return this.trainingPeaksService.syncWorkouts(req, query);
  }

  // Disconnect integration

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Disconnect an integration' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Integration not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':provider')
  async disconnectIntegration(
    @Req() req: Request & { user: AuthUser },
    @Param('provider') provider: IntegrationProvider,
  ): Promise<void> {
    return this.service.disconnectIntegration(req, provider);
  }
}
