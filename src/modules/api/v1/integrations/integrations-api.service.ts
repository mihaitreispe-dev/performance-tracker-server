import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import { IntegrationProvider, UserIntegration, WorkoutExecutionSource } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { OAuthStateRepository } from 'src/repositories/oauth-state.repository';
import { SleepLogRepository } from 'src/repositories/sleep-log.repository';
import { UserIntegrationRepository } from 'src/repositories/user-integration.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';

import { GarminSleepSummary, GarminWebhookBody, OAuthCallbackQuery } from './request.dto';
import {
  OAuthUrlResponse,
  UserIntegrationDTO,
  UserIntegrationListResponse,
  UserIntegrationResponse,
  WebhookAckResponse,
} from './response.dto';

@Injectable()
export class IntegrationsApiService {
  private readonly logger = new Logger(IntegrationsApiService.name);

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

  // Garmin OAuth
  // NOTE: Garmin uses OAuth 1.0a which requires a proper implementation.
  // This integration is currently disabled pending proper OAuth 1.0a implementation.

  async getGarminAuthUrl(_req: Request & { user: AuthUser }): Promise<OAuthUrlResponse> {
    // Garmin OAuth 1.0a is not yet properly implemented
    // Returning an error to prevent users from attempting to connect
    throw new BadRequestException('Garmin integration is not yet available. Please check back later.');
  }

  async handleGarminCallback(_query: OAuthCallbackQuery): Promise<UserIntegrationResponse> {
    // Garmin OAuth 1.0a callback handling not implemented
    throw new BadRequestException('Garmin integration is not yet available. Please check back later.');
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
