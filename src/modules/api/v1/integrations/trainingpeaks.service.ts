import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { type Request } from 'express';
import { IntegrationProvider, UserIntegration, WorkoutExecutionSource } from 'src/database/interfaces';
import { RateLimiter } from 'src/lib/util/rate-limiter';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { OAuthStateRepository } from 'src/repositories/oauth-state.repository';
import { UserIntegrationRepository } from 'src/repositories/user-integration.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';

import { OAuthCallbackQuery, TrainingPeaksSyncQuery } from './request.dto';
import {
  OAuthUrlResponse,
  TrainingPeaksSyncResponse,
  TrainingPeaksSyncResultDTO,
  UserIntegrationDTO,
  UserIntegrationResponse,
} from './response.dto';

interface TrainingPeaksWorkout {
  Id: number;
  WorkoutDay: string;
  Title: string;
  WorkoutType: string;
  TotalTime: number;
  TotalTimePlanned: number;
  TotalDistance: number;
  TotalDistancePlanned: number;
  StartTime: string;
  StartTimePlanned: string;
  Completed: boolean;
  TSS: number;
  TSSPlanned: number;
  IF: number;
  IFPlanned: number;
  NormalizedPower: number;
  AveragePower: number;
  MaxPower: number;
  AverageHeartRate: number;
  MaxHeartRate: number;
  AverageCadence: number;
  AverageSpeed: number;
  MaxSpeed: number;
  Calories: number;
  ElevationGain: number;
  ElevationLoss: number;
}

@Injectable()
export class TrainingPeaksService {
  private readonly logger = new Logger(TrainingPeaksService.name);

  // TrainingPeaks rate limit: 100 requests per minute
  private readonly rateLimiter = new RateLimiter(90, 60 * 1000);

  constructor(
    private readonly userIntegrationRepository: UserIntegrationRepository,
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    private readonly workoutRouteRepository: WorkoutRouteRepository,
    private readonly oauthStateRepository: OAuthStateRepository,
    private readonly configService: AppConfigService,
  ) {}

  async getAuthUrl(req: Request & { user: AuthUser }): Promise<OAuthUrlResponse> {
    const clientId = this.configService.get('TRAININGPEAKS_CLIENT_ID');
    const redirectUri = this.configService.get('TRAININGPEAKS_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      throw new BadRequestException('TrainingPeaks integration not configured');
    }

    // Generate cryptographically secure state token stored in database
    const oauthState = await this.oauthStateRepository.create({
      user_id: req.user.id,
      provider: IntegrationProvider.TRAININGPEAKS,
      expiresInMinutes: 10,
    });

    // TrainingPeaks OAuth scopes
    const scopes = 'workouts:read athlete:profile';

    const authUrl = new URL('https://oauth.trainingpeaks.com/OAuth/Authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', oauthState.state_token);

    return { authUrl: authUrl.toString() };
  }

  async handleCallback(query: OAuthCallbackQuery): Promise<UserIntegrationResponse> {
    const clientId = this.configService.get('TRAININGPEAKS_CLIENT_ID');
    const clientSecret = this.configService.get('TRAININGPEAKS_CLIENT_SECRET');
    const redirectUri = this.configService.get('TRAININGPEAKS_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException('TrainingPeaks integration not configured');
    }

    if (!query.state) {
      throw new BadRequestException('Missing state parameter');
    }

    // Validate state token from database (cryptographically secure, one-time use)
    const oauthState = await this.oauthStateRepository.findAndValidate(query.state, IntegrationProvider.TRAININGPEAKS);
    if (!oauthState) {
      throw new BadRequestException('Invalid or expired state parameter');
    }

    // Delete state immediately to prevent reuse (one-time use)
    await this.oauthStateRepository.deleteByToken(query.state);

    const userId = oauthState.user_id;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth.trainingpeaks.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: query.code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      this.logger.error(`TrainingPeaks token exchange failed: ${errorText}`);
      throw new BadRequestException('Failed to exchange authorization code');
    }

    const tokenData = await tokenResponse.json();

    // Fetch user profile to get athlete ID
    const profileResponse = await fetch('https://api.trainingpeaks.com/v1/athlete/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    let externalUserId: string | null = null;
    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      externalUserId = String(profile.Id);
    }

    // Check if integration already exists
    const existing = await this.userIntegrationRepository.findByUserAndProvider(
      userId,
      IntegrationProvider.TRAININGPEAKS,
    );

    let integration: UserIntegration;
    if (existing) {
      integration = await this.userIntegrationRepository.updateById(existing.id, {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token ?? null,
        token_expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        external_user_id: externalUserId,
        scopes: query.scope ?? null,
        is_active: true,
      });
    } else {
      integration = await this.userIntegrationRepository.create({
        user_id: userId,
        provider: IntegrationProvider.TRAININGPEAKS,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token ?? null,
        token_expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        external_user_id: externalUserId,
        scopes: query.scope ?? null,
      });
    }

    return { data: this.mapIntegrationToDTO(integration) };
  }

  async syncWorkouts(
    req: Request & { user: AuthUser },
    query: TrainingPeaksSyncQuery,
  ): Promise<TrainingPeaksSyncResponse> {
    // Find user's TrainingPeaks integration
    let integration = await this.userIntegrationRepository.findByUserAndProvider(
      req.user.id,
      IntegrationProvider.TRAININGPEAKS,
    );

    if (!integration || !integration.is_active) {
      throw new NotFoundException('No active TrainingPeaks integration found');
    }

    // Refresh token if needed
    integration = await this.refreshTokenIfNeeded(integration);

    const limit = query.limit ?? 100;
    const afterDate = query.after ? new Date(query.after) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // Default: 1 year ago
    const beforeDate = query.before ? new Date(query.before) : new Date();

    // Fetch all existing synced workout IDs for deduplication
    const existingExecutions = await this.workoutExecutionRepository.findMany({
      filter: {
        userId: req.user.id,
        source: WorkoutExecutionSource.TRAININGPEAKS,
      },
    });
    const syncedWorkoutIds = new Set(existingExecutions.map((e) => e.external_id).filter(Boolean));

    // Fetch workouts from TrainingPeaks
    const workouts = await this.fetchWorkouts(integration, {
      startDate: afterDate,
      endDate: beforeDate,
      limit,
    });

    const result: TrainingPeaksSyncResultDTO = {
      totalWorkouts: workouts.length,
      syncedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      status: 'completed',
    };

    // Process each workout
    for (const workout of workouts) {
      const workoutId = String(workout.Id);

      // Skip if already synced
      if (syncedWorkoutIds.has(workoutId)) {
        result.skippedCount++;
        continue;
      }

      // Skip if not completed
      if (!workout.Completed) {
        result.skippedCount++;
        continue;
      }

      try {
        await this.syncWorkout(integration, workout);
        result.syncedCount++;
      } catch (error) {
        this.logger.error(`Failed to sync TrainingPeaks workout ${workoutId}: ${error}`);
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
      `TrainingPeaks sync complete: ${result.syncedCount} synced, ${result.skippedCount} skipped, ${result.failedCount} failed`,
    );

    return { data: result };
  }

  private async refreshTokenIfNeeded(integration: UserIntegration): Promise<UserIntegration> {
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

    this.logger.log(`Refreshing TrainingPeaks token for integration ${integration.id}`);

    const clientId = this.configService.get('TRAININGPEAKS_CLIENT_ID');
    const clientSecret = this.configService.get('TRAININGPEAKS_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new BadRequestException('TrainingPeaks integration not configured');
    }

    const tokenResponse = await fetch('https://oauth.trainingpeaks.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: integration.refresh_token,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      this.logger.error(`TrainingPeaks token refresh failed: ${errorText}`);
      throw new UnauthorizedException('Failed to refresh TrainingPeaks token. Please reconnect your account.');
    }

    const tokenData = await tokenResponse.json();

    // Update stored tokens
    const updatedIntegration = await this.userIntegrationRepository.updateById(integration.id, {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? integration.refresh_token,
      token_expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
    });

    this.logger.log(`TrainingPeaks token refreshed for integration ${integration.id}`);

    return updatedIntegration;
  }

  private async fetchWorkouts(
    integration: UserIntegration,
    options: { startDate: Date; endDate: Date; limit: number },
  ): Promise<TrainingPeaksWorkout[]> {
    await this.rateLimiter.waitForSlot();

    const startDateStr = options.startDate.toISOString().split('T')[0];
    const endDateStr = options.endDate.toISOString().split('T')[0];

    const url = new URL('https://api.trainingpeaks.com/v1/workouts');
    url.searchParams.set('startDate', startDateStr);
    url.searchParams.set('endDate', endDateStr);

    const response = await this.fetchWithRetry(url.toString(), {
      headers: { Authorization: `Bearer ${integration.access_token}` },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new UnauthorizedException('TrainingPeaks token expired. Please reconnect your account.');
      }
      throw new Error(`Failed to fetch TrainingPeaks workouts: ${response.status}`);
    }

    const workouts: TrainingPeaksWorkout[] = await response.json();

    return workouts.slice(0, options.limit);
  }

  private async syncWorkout(integration: UserIntegration, workout: TrainingPeaksWorkout): Promise<void> {
    const workoutId = String(workout.Id);

    // Check if workout already synced
    const existing = await this.workoutExecutionRepository.findByExternalId(
      workoutId,
      WorkoutExecutionSource.TRAININGPEAKS,
    );
    if (existing) {
      this.logger.log(`Workout ${workoutId} already synced`);
      return;
    }

    // Parse start time
    const startTime = new Date(workout.StartTime || workout.WorkoutDay);
    const durationSeconds = workout.TotalTime || 0;
    const endTime = new Date(startTime.getTime() + durationSeconds * 1000);

    // Create workout execution
    const execution = await this.workoutExecutionRepository.create({
      user_id: integration.user_id,
      workout_schedule_id: null,
      started_at: startTime,
      completed_at: endTime,
      duration_seconds: durationSeconds,
      source: WorkoutExecutionSource.TRAININGPEAKS,
      external_id: workoutId,
      notes: workout.Title || `${workout.WorkoutType} Workout`,
    });

    // Create route if distance available
    if (workout.TotalDistance && workout.TotalDistance > 0) {
      await this.workoutRouteRepository.create({
        workout_execution_id: execution.id,
        route_geojson: { type: 'LineString', coordinates: [] },
        total_distance_meters: String(workout.TotalDistance),
        elevation_gain_meters: workout.ElevationGain ? String(workout.ElevationGain) : null,
        elevation_loss_meters: workout.ElevationLoss ? String(workout.ElevationLoss) : null,
      });
    }

    this.logger.log(`Synced TrainingPeaks workout ${workoutId} as execution ${execution.id}`);
  }

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
