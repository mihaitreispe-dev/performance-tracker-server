import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { type Request } from 'express';
import { IntegrationProvider, UserIntegration, WorkoutExecutionSource } from 'src/database/interfaces';
import { RateLimiter } from 'src/lib/util/rate-limiter';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { OAuthStateRepository } from 'src/repositories/oauth-state.repository';
import { SleepLogRepository } from 'src/repositories/sleep-log.repository';
import { UserIntegrationRepository } from 'src/repositories/user-integration.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';

import {
  GarminSleepSummary,
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
  StravaSyncResultDTO,
  StravaWebhookVerifyResponse,
  UserIntegrationDTO,
  UserIntegrationListResponse,
  UserIntegrationResponse,
  WebhookAckResponse,
} from './response.dto';

interface StravaActivitySummary {
  id: number;
  name: string;
  type: string;
  start_date: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  total_elevation_gain?: number;
  map?: {
    summary_polyline?: string;
  };
}

@Injectable()
export class IntegrationsApiService {
  private readonly logger = new Logger(IntegrationsApiService.name);

  // Strava rate limit: 100 requests per 15 minutes, using 95 as buffer
  private readonly stravaRateLimiter = new RateLimiter(95, 15 * 60 * 1000);

  constructor(
    private readonly userIntegrationRepository: UserIntegrationRepository,
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    private readonly cardioMetricsRepository: CardioMetricsRepository,
    private readonly workoutRouteRepository: WorkoutRouteRepository,
    private readonly sleepLogRepository: SleepLogRepository,
    private readonly oauthStateRepository: OAuthStateRepository,
    private readonly configService: AppConfigService,
  ) {}

  // List integrations for user

  async listIntegrations(req: Request & { user: AuthUser }): Promise<UserIntegrationListResponse> {
    const integrations = await this.userIntegrationRepository.findMany({
      userId: req.user.id,
    });

    return {
      data: integrations.map((i) => this.mapIntegrationToDTO(i)),
    };
  }

  // Strava OAuth

  async getStravaAuthUrl(req: Request & { user: AuthUser }): Promise<OAuthUrlResponse> {
    const clientId = this.configService.get('STRAVA_CLIENT_ID');
    const redirectUri = this.configService.get('STRAVA_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      throw new BadRequestException('Strava integration not configured');
    }

    // Generate cryptographically secure state token stored in database
    const oauthState = await this.oauthStateRepository.create({
      user_id: req.user.id,
      provider: IntegrationProvider.STRAVA,
      expiresInMinutes: 10,
    });

    const scopes = 'read,activity:read_all';

    const authUrl = new URL('https://www.strava.com/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', oauthState.state_token);

    return { authUrl: authUrl.toString() };
  }

  async handleStravaCallback(query: OAuthCallbackQuery): Promise<UserIntegrationResponse> {
    const clientId = this.configService.get('STRAVA_CLIENT_ID');
    const clientSecret = this.configService.get('STRAVA_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new BadRequestException('Strava integration not configured');
    }

    if (!query.state) {
      throw new BadRequestException('Missing state parameter');
    }

    // Validate state token from database (cryptographically secure, one-time use)
    const oauthState = await this.oauthStateRepository.findAndValidate(query.state, IntegrationProvider.STRAVA);
    if (!oauthState) {
      throw new BadRequestException('Invalid or expired state parameter');
    }

    // Delete state immediately to prevent reuse (one-time use)
    await this.oauthStateRepository.deleteByToken(query.state);

    const userId = oauthState.user_id;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: query.code,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      this.logger.error(`Strava token exchange failed: ${errorText}`);
      throw new BadRequestException('Failed to exchange authorization code');
    }

    const tokenData = await tokenResponse.json();

    // Check if integration already exists
    const existing = await this.userIntegrationRepository.findByUserAndProvider(userId, IntegrationProvider.STRAVA);

    let integration: UserIntegration;
    if (existing) {
      integration = await this.userIntegrationRepository.updateById(existing.id, {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: new Date(tokenData.expires_at * 1000),
        external_user_id: String(tokenData.athlete.id),
        scopes: query.scope ?? null,
        is_active: true,
      });
    } else {
      integration = await this.userIntegrationRepository.create({
        user_id: userId,
        provider: IntegrationProvider.STRAVA,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: new Date(tokenData.expires_at * 1000),
        external_user_id: String(tokenData.athlete.id),
        scopes: query.scope ?? null,
      });
    }

    return { data: this.mapIntegrationToDTO(integration) };
  }

  handleStravaWebhookVerify(query: StravaWebhookQuery): StravaWebhookVerifyResponse | null {
    const verifyToken = this.configService.get('STRAVA_WEBHOOK_VERIFY_TOKEN');

    if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === verifyToken) {
      return { 'hub.challenge': query['hub.challenge']! };
    }

    return null;
  }

  async handleStravaWebhook(body: StravaWebhookBody): Promise<WebhookAckResponse> {
    this.logger.log(`Received Strava webhook: ${body.object_type} ${body.aspect_type} for owner ${body.owner_id}`);

    // Only process activity creates for now
    if (body.object_type !== 'activity' || body.aspect_type !== 'create') {
      return { status: 'ignored' };
    }

    // Find user integration by Strava athlete ID
    let integration = await this.userIntegrationRepository.findByProviderExternalId(
      IntegrationProvider.STRAVA,
      String(body.owner_id),
    );

    if (!integration || !integration.is_active) {
      this.logger.warn(`No active integration found for Strava athlete ${body.owner_id}`);
      return { status: 'no_integration' };
    }

    // Refresh token if needed
    integration = await this.refreshStravaTokenIfNeeded(integration);

    // Fetch activity details from Strava
    try {
      await this.syncStravaActivity(integration, body.object_id);
      return { status: 'synced' };
    } catch (error) {
      this.logger.error(`Failed to sync Strava activity ${body.object_id}: ${error}`);
      return { status: 'error' };
    }
  }

  // Bulk sync all Strava activities

  async syncAllStravaActivities(
    req: Request & { user: AuthUser },
    query: StravaSyncQuery,
  ): Promise<StravaSyncResponse> {
    // Find user's Strava integration
    let integration = await this.userIntegrationRepository.findByUserAndProvider(
      req.user.id,
      IntegrationProvider.STRAVA,
    );

    if (!integration || !integration.is_active) {
      throw new NotFoundException('No active Strava integration found');
    }

    // Refresh token if needed
    integration = await this.refreshStravaTokenIfNeeded(integration);

    const limit = query.limit ?? 200;
    const afterDate = query.after ? new Date(query.after) : undefined;
    const beforeDate = query.before ? new Date(query.before) : undefined;

    // Fetch all existing synced activity IDs for deduplication
    const existingExecutions = await this.workoutExecutionRepository.findMany({
      filter: {
        userId: req.user.id,
        source: WorkoutExecutionSource.STRAVA,
      },
    });
    const syncedActivityIds = new Set(existingExecutions.map((e) => e.external_id).filter(Boolean));

    // Fetch activities from Strava with pagination
    const activities = await this.fetchAllStravaActivities(integration, {
      after: afterDate,
      before: beforeDate,
      limit,
    });

    const result: StravaSyncResultDTO = {
      totalActivities: activities.length,
      syncedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      status: 'completed',
    };

    // Process each activity
    for (const activity of activities) {
      const activityId = activity.id;

      // Skip if already synced
      if (syncedActivityIds.has(String(activityId))) {
        result.skippedCount++;
        continue;
      }

      try {
        // Wait for rate limit slot
        await this.stravaRateLimiter.waitForSlot();

        // Sync the activity
        await this.syncStravaActivity(integration, activityId);
        result.syncedCount++;
      } catch (error) {
        this.logger.error(`Failed to sync Strava activity ${activityId}: ${error}`);
        result.failedCount++;
      }
    }

    // Update last sync time
    await this.userIntegrationRepository.updateById(integration.id, {
      last_sync_at: new Date(),
    });

    if (result.failedCount > 0 && result.syncedCount === 0) {
      result.status = 'error';
    }

    this.logger.log(
      `Strava bulk sync complete: ${result.syncedCount} synced, ${result.skippedCount} skipped, ${result.failedCount} failed`,
    );

    return { data: result };
  }

  // Push a workout execution to Strava

  async pushToStrava(req: Request & { user: AuthUser }, body: PushToStravaBody): Promise<PushToStravaResponse> {
    // Find user's Strava integration
    let integration = await this.userIntegrationRepository.findByUserAndProvider(
      req.user.id,
      IntegrationProvider.STRAVA,
    );

    if (!integration || !integration.is_active) {
      throw new NotFoundException('No active Strava integration found');
    }

    // Refresh token if needed
    integration = await this.refreshStravaTokenIfNeeded(integration);

    // Get the workout execution
    const execution = await this.workoutExecutionRepository.findById(body.workoutExecutionId);

    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }

    if (execution.user_id !== req.user.id) {
      throw new BadRequestException('Workout execution does not belong to you');
    }

    // Don't push if already synced from Strava
    if (execution.source === WorkoutExecutionSource.STRAVA) {
      throw new BadRequestException('This workout was synced from Strava and cannot be pushed back');
    }

    // Don't push if already pushed (has Strava external ID indicating previous push)
    if (execution.external_id?.startsWith('strava:')) {
      const existingStravaId = execution.external_id.substring(7);
      return {
        data: {
          success: true,
          stravaActivityId: Number.parseInt(existingStravaId, 10),
        },
      };
    }

    // Get route data if available
    const route = await this.workoutRouteRepository.findByExecutionId(body.workoutExecutionId);

    // Map workout type to Strava sport type
    const sportType = this.mapToStravaSportType(execution.notes || 'Workout');

    // Calculate duration
    const durationSeconds =
      execution.duration_seconds ||
      (execution.completed_at && execution.started_at
        ? Math.floor((new Date(execution.completed_at).getTime() - new Date(execution.started_at).getTime()) / 1000)
        : 0);

    // Build activity creation payload
    const activityPayload: Record<string, unknown> = {
      name: execution.notes || 'Workout',
      sport_type: sportType,
      start_date_local: new Date(execution.started_at).toISOString(),
      elapsed_time: durationSeconds,
      type: sportType,
    };

    // Add distance if route exists
    if (route?.total_distance_meters) {
      activityPayload.distance = Number.parseFloat(route.total_distance_meters);
    }

    try {
      await this.stravaRateLimiter.waitForSlot();

      const response = await this.fetchWithRetry('https://www.strava.com/api/v3/activities', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${integration.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(activityPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Failed to push to Strava: ${response.status} - ${errorText}`);

        if (response.status === 401) {
          throw new UnauthorizedException('Strava token expired. Please reconnect your account.');
        }

        return {
          data: {
            success: false,
            error: `Strava API error: ${response.status}`,
          },
        };
      }

      const stravaActivity = await response.json();
      const stravaActivityId = stravaActivity.id;

      // Update execution with Strava external ID (prefixed to indicate push)
      await this.workoutExecutionRepository.updateById(execution.id, {
        external_id: `strava:${stravaActivityId}`,
      });

      this.logger.log(`Pushed workout execution ${execution.id} to Strava as activity ${stravaActivityId}`);

      return {
        data: {
          success: true,
          stravaActivityId,
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error(`Failed to push to Strava: ${error}`);

      return {
        data: {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  // Map workout notes/type to Strava sport type
  private mapToStravaSportType(workoutName: string): string {
    const nameLower = workoutName.toLowerCase();

    if (nameLower.includes('run') || nameLower.includes('jog')) return 'Run';
    if (nameLower.includes('cycling') || nameLower.includes('bike') || nameLower.includes('ride')) return 'Ride';
    if (nameLower.includes('swim')) return 'Swim';
    if (nameLower.includes('walk')) return 'Walk';
    if (nameLower.includes('hike')) return 'Hike';
    if (nameLower.includes('yoga')) return 'Yoga';
    if (nameLower.includes('weight') || nameLower.includes('strength') || nameLower.includes('gym')) {
      return 'WeightTraining';
    }
    if (nameLower.includes('hiit') || nameLower.includes('circuit')) return 'Workout';
    if (nameLower.includes('row')) return 'Rowing';
    if (nameLower.includes('ski')) return 'NordicSki';

    return 'Workout';
  }

  // Refresh Strava token if expired or expiring soon

  private async refreshStravaTokenIfNeeded(integration: UserIntegration): Promise<UserIntegration> {
    if (!integration.token_expires_at || !integration.refresh_token) {
      return integration;
    }

    const now = new Date();
    const expiresAt = new Date(integration.token_expires_at);
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    // Token is still valid for more than 5 minutes
    if (expiresAt > fiveMinutesFromNow) {
      return integration;
    }

    this.logger.log(`Refreshing Strava token for integration ${integration.id}`);

    const clientId = this.configService.get('STRAVA_CLIENT_ID');
    const clientSecret = this.configService.get('STRAVA_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new BadRequestException('Strava integration not configured');
    }

    const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: integration.refresh_token,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      this.logger.error(`Strava token refresh failed: ${errorText}`);
      throw new UnauthorizedException('Failed to refresh Strava token. Please reconnect your Strava account.');
    }

    const tokenData = await tokenResponse.json();

    // Update stored tokens
    const updatedIntegration = await this.userIntegrationRepository.updateById(integration.id, {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: new Date(tokenData.expires_at * 1000),
    });

    this.logger.log(`Strava token refreshed for integration ${integration.id}`);

    return updatedIntegration;
  }

  // Fetch all activities from Strava with pagination

  private async fetchAllStravaActivities(
    integration: UserIntegration,
    options: { after?: Date; before?: Date; limit: number },
  ): Promise<StravaActivitySummary[]> {
    const activities: StravaActivitySummary[] = [];
    const perPage = 200; // Strava max per page
    let page = 1;

    while (activities.length < options.limit) {
      await this.stravaRateLimiter.waitForSlot();

      const url = new URL('https://www.strava.com/api/v3/athlete/activities');
      url.searchParams.set('page', String(page));
      url.searchParams.set('per_page', String(Math.min(perPage, options.limit - activities.length)));

      if (options.after) {
        url.searchParams.set('after', String(Math.floor(options.after.getTime() / 1000)));
      }
      if (options.before) {
        url.searchParams.set('before', String(Math.floor(options.before.getTime() / 1000)));
      }

      const response = await this.fetchWithRetry(url.toString(), {
        headers: { Authorization: `Bearer ${integration.access_token}` },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new UnauthorizedException('Strava token expired. Please reconnect your account.');
        }
        if (response.status === 429) {
          // Rate limited - wait 15 minutes
          this.logger.warn('Strava rate limited, waiting 15 minutes...');
          await this.delay(15 * 60 * 1000);
          continue;
        }
        throw new Error(`Failed to fetch Strava activities: ${response.status}`);
      }

      const pageActivities: StravaActivitySummary[] = await response.json();

      if (pageActivities.length === 0) {
        break; // No more activities
      }

      activities.push(...pageActivities);
      page++;

      // Check if we got fewer results than requested (last page)
      if (pageActivities.length < perPage) {
        break;
      }
    }

    return activities.slice(0, options.limit);
  }

  // Fetch with retry for network errors

  private async fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fetch(url, options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Fetch attempt ${attempt} failed: ${lastError.message}`);

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          await this.delay(Math.pow(2, attempt - 1) * 1000);
        }
      }
    }

    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async syncStravaActivity(integration: UserIntegration, activityId: number): Promise<void> {
    // Check if activity already synced
    const existing = await this.workoutExecutionRepository.findByExternalId(
      String(activityId),
      WorkoutExecutionSource.STRAVA,
    );
    if (existing) {
      this.logger.log(`Activity ${activityId} already synced`);
      return;
    }

    // Fetch activity from Strava API
    const activityResponse = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${integration.access_token}` },
    });

    if (!activityResponse.ok) {
      throw new Error(`Failed to fetch activity: ${activityResponse.status}`);
    }

    const activity = await activityResponse.json();

    // Create workout execution
    const execution = await this.workoutExecutionRepository.create({
      user_id: integration.user_id,
      workout_schedule_id: null,
      started_at: new Date(activity.start_date),
      completed_at: new Date(new Date(activity.start_date).getTime() + activity.elapsed_time * 1000),
      duration_seconds: activity.moving_time,
      source: WorkoutExecutionSource.STRAVA,
      external_id: String(activityId),
      notes: activity.name,
    });

    // If there's a map with polyline, create route
    if (activity.map?.summary_polyline) {
      // Decode polyline (simplified - in production you'd use a polyline library)
      // For now, just store the polyline as-is and decode on client
      const coordinates = this.decodePolyline(activity.map.summary_polyline);

      if (coordinates.length > 0) {
        await this.workoutRouteRepository.create({
          workout_execution_id: execution.id,
          route_geojson: {
            type: 'LineString',
            coordinates: coordinates.map(([lat, lng]) => [lng, lat]),
          },
          total_distance_meters: String(activity.distance),
          elevation_gain_meters: activity.total_elevation_gain ? String(activity.total_elevation_gain) : null,
          elevation_loss_meters: null,
        });
      }
    }

    // Update last sync time
    await this.userIntegrationRepository.updateById(integration.id, {
      last_sync_at: new Date(),
    });

    this.logger.log(`Synced Strava activity ${activityId} as execution ${execution.id}`);
  }

  // Simple polyline decoder (Google Encoded Polyline Algorithm)
  private decodePolyline(encoded: string): [number, number][] {
    const coordinates: [number, number][] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let b: number;
      let shift = 0;
      let result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      coordinates.push([lat / 1e5, lng / 1e5]);
    }

    return coordinates;
  }

  // Garmin OAuth
  // NOTE: Garmin uses OAuth 1.0a which requires a proper implementation.
  // This integration is currently disabled pending proper OAuth 1.0a implementation.

  async getGarminAuthUrl(_req: Request & { user: AuthUser }): Promise<OAuthUrlResponse> {
    // Garmin OAuth 1.0a is not yet properly implemented
    // Returning an error to prevent users from attempting to connect
    throw new BadRequestException(
      'Garmin integration is not yet available. Please check back later or use Strava integration.',
    );
  }

  async handleGarminCallback(_query: OAuthCallbackQuery): Promise<UserIntegrationResponse> {
    // Garmin OAuth 1.0a callback handling not implemented
    throw new BadRequestException(
      'Garmin integration is not yet available. Please check back later or use Strava integration.',
    );
  }

  async handleGarminWebhook(body: GarminWebhookBody): Promise<WebhookAckResponse> {
    const activityCount = body.activities?.length ?? 0;
    const sleepCount = body.sleeps?.length ?? 0;
    this.logger.log(`Received Garmin webhook with ${activityCount} activities and ${sleepCount} sleep summaries`);

    if (activityCount === 0 && sleepCount === 0) {
      return { status: 'no_data' };
    }

    // Process activities
    if (body.activities && body.activities.length > 0) {
      for (const activity of body.activities) {
        try {
          await this.syncGarminActivity(activity);
        } catch (error) {
          this.logger.error(`Failed to sync Garmin activity ${activity.activityId}: ${error}`);
        }
      }
    }

    // Process sleep data
    if (body.sleeps && body.sleeps.length > 0) {
      for (const sleep of body.sleeps) {
        try {
          await this.syncGarminSleep(sleep);
        } catch (error) {
          this.logger.error(`Failed to sync Garmin sleep ${sleep.summaryId}: ${error}`);
        }
      }
    }

    return { status: 'synced' };
  }

  private async syncGarminActivity(activity: any): Promise<void> {
    // Find user integration by Garmin user ID
    const integration = await this.userIntegrationRepository.findByProviderExternalId(
      IntegrationProvider.GARMIN,
      activity.userId,
    );

    if (!integration || !integration.is_active) {
      this.logger.warn(`No active integration found for Garmin user ${activity.userId}`);
      return;
    }

    // Check if activity already synced
    const existing = await this.workoutExecutionRepository.findByExternalId(
      String(activity.activityId),
      WorkoutExecutionSource.GARMIN,
    );
    if (existing) {
      this.logger.log(`Activity ${activity.activityId} already synced`);
      return;
    }

    const startTime = new Date(activity.startTimeInSeconds * 1000);

    // Create workout execution
    const execution = await this.workoutExecutionRepository.create({
      user_id: integration.user_id,
      workout_schedule_id: null,
      started_at: startTime,
      completed_at: new Date(startTime.getTime() + activity.durationInSeconds * 1000),
      duration_seconds: activity.durationInSeconds,
      source: WorkoutExecutionSource.GARMIN,
      external_id: String(activity.activityId),
      notes: activity.activityName,
    });

    // Create route if distance available
    if (activity.distanceInMeters) {
      // Note: Garmin webhook doesn't include polyline, would need separate API call
      await this.workoutRouteRepository.create({
        workout_execution_id: execution.id,
        route_geojson: { type: 'LineString', coordinates: [] },
        total_distance_meters: String(activity.distanceInMeters),
        elevation_gain_meters: activity.totalElevationGainInMeters ? String(activity.totalElevationGainInMeters) : null,
        elevation_loss_meters: activity.totalElevationLossInMeters ? String(activity.totalElevationLossInMeters) : null,
      });
    }

    // Update last sync time
    await this.userIntegrationRepository.updateById(integration.id, {
      last_sync_at: new Date(),
    });

    this.logger.log(`Synced Garmin activity ${activity.activityId} as execution ${execution.id}`);
  }

  private async syncGarminSleep(sleep: GarminSleepSummary): Promise<void> {
    // Find user integration by Garmin user ID
    const integration = await this.userIntegrationRepository.findByProviderExternalId(
      IntegrationProvider.GARMIN,
      sleep.userId,
    );

    if (!integration || !integration.is_active) {
      this.logger.warn(`No active integration found for Garmin user ${sleep.userId}`);
      return;
    }

    // Check if sleep already synced by external_id (summaryId)
    const existing = await this.sleepLogRepository.findByExternalId(sleep.summaryId);
    if (existing) {
      this.logger.log(`Sleep ${sleep.summaryId} already synced`);
      return;
    }

    // Calculate sleep stage durations from sleepLevelsMap
    let awakeDurationSeconds = 0;
    let lightDurationSeconds = 0;
    let deepDurationSeconds = 0;
    let remDurationSeconds = 0;

    if (sleep.sleepLevelsMap) {
      awakeDurationSeconds = this.calculateSleepStageDuration(sleep.sleepLevelsMap.awake);
      lightDurationSeconds = this.calculateSleepStageDuration(sleep.sleepLevelsMap.light);
      deepDurationSeconds = this.calculateSleepStageDuration(sleep.sleepLevelsMap.deep);
      remDurationSeconds = this.calculateSleepStageDuration(sleep.sleepLevelsMap.rem);
    }

    // Convert HR samples from timeOffset format to absolute timestamps
    let hrSamples: { timestampSeconds: number; heartRate: number }[] | null = null;
    if (sleep.timeOffsetHeartRateSamples && Object.keys(sleep.timeOffsetHeartRateSamples).length > 0) {
      hrSamples = Object.entries(sleep.timeOffsetHeartRateSamples).map(([offsetStr, heartRate]) => ({
        timestampSeconds: sleep.startTimeInSeconds + Number.parseInt(offsetStr, 10),
        heartRate,
      }));
    }

    // Calculate start and end times
    const startTime = new Date(sleep.startTimeInSeconds * 1000);
    const endTime = new Date((sleep.startTimeInSeconds + sleep.durationInSeconds) * 1000);
    const logDate = new Date(sleep.calendarDate);

    // Create sleep log
    const sleepLog = await this.sleepLogRepository.create({
      user_id: integration.user_id,
      log_date: logDate,
      start_time: startTime,
      end_time: endTime,
      total_duration_seconds: sleep.durationInSeconds,
      awake_duration_seconds: awakeDurationSeconds,
      light_duration_seconds: lightDurationSeconds,
      deep_duration_seconds: deepDurationSeconds,
      rem_duration_seconds: remDurationSeconds,
      avg_resting_hr: sleep.restingHeartRateInBeatsPerMinute ?? null,
      avg_hrv: sleep.avgOvernightHrv ?? null,
      hr_samples: hrSamples,
      source: 'garmin',
      external_id: sleep.summaryId,
    });

    // Update last sync time
    await this.userIntegrationRepository.updateById(integration.id, {
      last_sync_at: new Date(),
    });

    this.logger.log(`Synced Garmin sleep ${sleep.summaryId} as sleep log ${sleepLog.id}`);
  }

  private calculateSleepStageDuration(intervals?: { startTimeInSeconds: number; endTimeInSeconds: number }[]): number {
    if (!intervals || intervals.length === 0) {
      return 0;
    }
    return intervals.reduce((total, interval) => {
      return total + (interval.endTimeInSeconds - interval.startTimeInSeconds);
    }, 0);
  }

  // Disconnect integration

  async disconnectIntegration(req: Request & { user: AuthUser }, provider: IntegrationProvider): Promise<void> {
    const integration = await this.userIntegrationRepository.findByUserAndProvider(req.user.id, provider);

    if (!integration) {
      throw new BadRequestException(`No ${provider} integration found`);
    }

    await this.userIntegrationRepository.deleteById(integration.id);
  }

  // Mapper

  private mapIntegrationToDTO(integration: UserIntegration): UserIntegrationDTO {
    const lastSyncAt = integration.last_sync_at
      ? integration.last_sync_at instanceof Date
        ? integration.last_sync_at.toISOString()
        : String(integration.last_sync_at)
      : null;
    const createdAt =
      integration.created_at instanceof Date ? integration.created_at.toISOString() : String(integration.created_at);
    const updatedAt =
      integration.updated_at instanceof Date ? integration.updated_at.toISOString() : String(integration.updated_at);

    return {
      id: integration.id,
      userId: integration.user_id,
      provider: integration.provider,
      externalUserId: integration.external_user_id,
      isActive: integration.is_active,
      lastSyncAt,
      createdAt,
      updatedAt,
    };
  }
}
