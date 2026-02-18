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
  PushToStravaBody,
  StravaSyncQuery,
  StravaWebhookBody,
  StravaWebhookQuery,
} from './request.dto';
import {
  OAuthUrlResponse,
  PushToStravaResponse,
  StravaSyncResponse,
  StravaWebhookVerifyResponse,
  UserIntegrationListResponse,
  UserIntegrationResponse,
  WebhookAckResponse,
} from './response.dto';

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsApiController {
  constructor(private readonly service: IntegrationsApiService) {}

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

  // Strava OAuth

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get Strava OAuth authorization URL' })
  @ApiResponse({ status: HttpStatus.OK, type: OAuthUrlResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('strava/auth')
  getStravaAuthUrl(@Req() req: Request & { user: AuthUser }): OAuthUrlResponse {
    return this.service.getStravaAuthUrl(req);
  }

  @Version('1')
  @DisableJwtAuthGuard()
  @ApiOperation({ summary: 'Strava OAuth callback' })
  @ApiResponse({ status: HttpStatus.OK, type: UserIntegrationResponse })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Invalid callback' })
  @Get('strava/callback')
  async handleStravaCallback(@Query() query: OAuthCallbackQuery): Promise<UserIntegrationResponse> {
    return this.service.handleStravaCallback(query);
  }

  @Version('1')
  @DisableJwtAuthGuard()
  @ApiOperation({ summary: 'Strava webhook endpoint (verification and events)' })
  @ApiResponse({ status: HttpStatus.OK })
  @Get('strava/webhook')
  handleStravaWebhookVerify(@Query() query: StravaWebhookQuery): StravaWebhookVerifyResponse | Record<string, never> {
    const result = this.service.handleStravaWebhookVerify(query);
    return result ?? {};
  }

  @Version('1')
  @DisableJwtAuthGuard()
  @ApiOperation({ summary: 'Strava webhook receiver' })
  @ApiResponse({ status: HttpStatus.OK, type: WebhookAckResponse })
  @Post('strava/webhook')
  async handleStravaWebhook(@Body() body: StravaWebhookBody): Promise<WebhookAckResponse> {
    return this.service.handleStravaWebhook(body);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Sync all Strava activities' })
  @ApiResponse({ status: HttpStatus.OK, type: StravaSyncResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'No Strava integration found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized or token expired' })
  @Post('strava/sync')
  async syncAllStravaActivities(
    @Req() req: Request & { user: AuthUser },
    @Query() query: StravaSyncQuery,
  ): Promise<StravaSyncResponse> {
    return this.service.syncAllStravaActivities(req, query);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Push a workout execution to Strava' })
  @ApiResponse({ status: HttpStatus.OK, type: PushToStravaResponse })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponse,
    description: 'No Strava integration or workout not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    type: ErrorResponse,
    description: 'Cannot push Strava-synced workouts',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized or token expired' })
  @Post('strava/push')
  async pushToStrava(
    @Req() req: Request & { user: AuthUser },
    @Body() body: PushToStravaBody,
  ): Promise<PushToStravaResponse> {
    return this.service.pushToStrava(req, body);
  }

  // Garmin OAuth

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get Garmin OAuth authorization URL' })
  @ApiResponse({ status: HttpStatus.OK, type: OAuthUrlResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('garmin/auth')
  getGarminAuthUrl(@Req() req: Request & { user: AuthUser }): OAuthUrlResponse {
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
