import { Injectable, Logger } from '@nestjs/common';
import { format, parseISO, subDays } from 'date-fns';
import {
  HealthMetricType,
  NewDailyHealthMetric,
  NewSleepLog,
  WearableDataCategory,
  WearableProvider,
  WearableProviderConnection,
} from 'src/database/interfaces';
import { DailyHealthMetricRepository } from 'src/repositories/daily-health-metric.repository';
import { SleepLogRepository } from 'src/repositories/sleep-log.repository';
import { WearableProviderConnectionRepository } from 'src/repositories/wearable-provider-connection.repository';
import { WearableProviderPriorityRepository } from 'src/repositories/wearable-provider-priority.repository';

import type { OWActivityAggregate } from './openwearables.service';
import { OpenWearablesService, OWSleepSession, OWTimeSeries } from './openwearables.service';

export interface SyncResult {
  workouts: { synced: number; errors: number };
  sleep: { synced: number; errors: number };
  healthMetrics: { synced: number; errors: number };
  activity: { synced: number; errors: number };
}

@Injectable()
export class WearableSyncService {
  private readonly logger = new Logger(WearableSyncService.name);

  constructor(
    private readonly openWearablesService: OpenWearablesService,
    private readonly connectionRepo: WearableProviderConnectionRepository,
    private readonly priorityRepo: WearableProviderPriorityRepository,
    private readonly sleepLogRepo: SleepLogRepository,
    private readonly healthMetricRepo: DailyHealthMetricRepository,
  ) {}

  /**
   * Sync all data for a user from their connected providers
   */
  async syncAllForUser(userId: string, daysBack = 7): Promise<SyncResult> {
    const result: SyncResult = {
      workouts: { synced: 0, errors: 0 },
      sleep: { synced: 0, errors: 0 },
      healthMetrics: { synced: 0, errors: 0 },
      activity: { synced: 0, errors: 0 },
    };

    const connections = await this.connectionRepo.findMany({
      userId,
      isActive: true,
    });

    if (connections.length === 0) {
      this.logger.log(`No active connections for user ${userId}`);
      return result;
    }

    const startDate = format(subDays(new Date(), daysBack), 'yyyy-MM-dd');
    const endDate = format(new Date(), 'yyyy-MM-dd');

    // Group connections by OpenWearables user ID
    const connectionsByOwUser = new Map<string, WearableProviderConnection[]>();
    for (const conn of connections) {
      const existing = connectionsByOwUser.get(conn.openwearables_user_id) || [];
      existing.push(conn);
      connectionsByOwUser.set(conn.openwearables_user_id, existing);
    }

    for (const [owUserId, userConnections] of connectionsByOwUser) {
      try {
        // Sync workouts
        const workoutResult = await this.syncWorkouts(userId, owUserId, userConnections, startDate, endDate);
        result.workouts.synced += workoutResult.synced;
        result.workouts.errors += workoutResult.errors;

        // Sync sleep
        const sleepResult = await this.syncSleep(userId, owUserId, userConnections, startDate, endDate);
        result.sleep.synced += sleepResult.synced;
        result.sleep.errors += sleepResult.errors;

        // Sync health metrics
        const metricsResult = await this.syncHealthMetrics(userId, owUserId, userConnections, startDate, endDate);
        result.healthMetrics.synced += metricsResult.synced;
        result.healthMetrics.errors += metricsResult.errors;

        // Sync activity (steps, calories, distance)
        const activityResult = await this.syncActivity(userId, owUserId, userConnections, startDate, endDate);
        result.activity.synced += activityResult.synced;
        result.activity.errors += activityResult.errors;

        // Update sync status for connections
        for (const conn of userConnections) {
          await this.connectionRepo.updateSyncStatus(conn.id, 'success');
        }
      } catch (error) {
        this.logger.error(`Failed to sync for OW user ${owUserId}: ${error}`);
        for (const conn of userConnections) {
          await this.connectionRepo.updateSyncStatus(conn.id, 'error', String(error));
        }
      }
    }

    return result;
  }

  /**
   * Sync workouts from OpenWearables
   */
  private async syncWorkouts(
    userId: string,
    owUserId: string,
    connections: WearableProviderConnection[],
    startDate: string,
    endDate: string,
  ): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    // Get priority provider for workouts
    const priorityProvider = await this.priorityRepo.getHighestPriorityProvider(userId, WearableDataCategory.WORKOUTS);

    try {
      const workoutsResponse = await this.openWearablesService.getWorkouts(owUserId, {
        startDate,
        endDate,
        limit: 100,
      });

      for (const workout of workoutsResponse.items) {
        try {
          const provider = this.openWearablesService.mapToWearableProvider(workout.source.provider);
          if (!provider) continue;

          // Check if this provider is connected and supports workouts
          const connection = connections.find(
            (c) => c.provider === provider && c.supported_categories.includes(WearableDataCategory.WORKOUTS),
          );
          if (!connection) continue;

          // If priority is set and this isn't the priority provider, skip
          // (we only want to import from the highest priority provider)
          if (priorityProvider && provider !== priorityProvider) {
            continue;
          }

          // TODO: Import workout to workout_executions table
          // This requires creating a workout execution with the workout data
          // For now, we'll just log it
          this.logger.debug(`Would sync workout ${workout.id} from ${provider}`);
          synced++;
        } catch (error) {
          this.logger.error(`Failed to sync workout ${workout.id}: ${error}`);
          errors++;
        }
      }
    } catch (error) {
      this.logger.error(`Failed to fetch workouts from OpenWearables: ${error}`);
      errors++;
    }

    return { synced, errors };
  }

  /**
   * Sync sleep sessions from OpenWearables
   */
  private async syncSleep(
    userId: string,
    owUserId: string,
    connections: WearableProviderConnection[],
    startDate: string,
    endDate: string,
  ): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    // Get priority provider for sleep
    const priorityProvider = await this.priorityRepo.getHighestPriorityProvider(userId, WearableDataCategory.SLEEP);

    try {
      const sleepResponse = await this.openWearablesService.getSleepSessions(owUserId, {
        startDate,
        endDate,
        limit: 100,
      });

      for (const session of sleepResponse.items) {
        try {
          const provider = this.openWearablesService.mapToWearableProvider(session.source.provider);
          if (!provider) continue;

          // Check if this provider is connected and supports sleep
          const connection = connections.find(
            (c) => c.provider === provider && c.supported_categories.includes(WearableDataCategory.SLEEP),
          );
          if (!connection) continue;

          // If priority is set and this isn't the priority provider, skip
          if (priorityProvider && provider !== priorityProvider) {
            continue;
          }

          // Skip naps for now
          if (session.is_nap) continue;

          await this.importSleepSession(userId, session, provider);
          synced++;
        } catch (error) {
          this.logger.error(`Failed to sync sleep session ${session.id}: ${error}`);
          errors++;
        }
      }
    } catch (error) {
      this.logger.error(`Failed to fetch sleep from OpenWearables: ${error}`);
      errors++;
    }

    return { synced, errors };
  }

  /**
   * Import a sleep session to our database
   */
  private async importSleepSession(userId: string, session: OWSleepSession, provider: WearableProvider): Promise<void> {
    const startTime = parseISO(session.start_time);
    const endTime = parseISO(session.end_time);
    const logDate = format(startTime, 'yyyy-MM-dd');

    const sleepLog: NewSleepLog = {
      user_id: userId,
      log_date: new Date(logDate),
      start_time: startTime,
      end_time: endTime,
      total_duration_seconds: session.duration_seconds,
      awake_duration_seconds: session.stages?.awake_seconds ?? 0,
      light_duration_seconds: session.stages?.light_seconds ?? 0,
      deep_duration_seconds: session.stages?.deep_seconds ?? 0,
      rem_duration_seconds: session.stages?.rem_seconds ?? 0,
      source: provider,
      external_id: session.id,
    };

    await this.sleepLogRepo.upsertByExternalId(sleepLog);
  }

  /**
   * Sync health metrics from OpenWearables
   */
  private async syncHealthMetrics(
    userId: string,
    owUserId: string,
    connections: WearableProviderConnection[],
    startDate: string,
    endDate: string,
  ): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    // Get priority provider for health metrics
    const priorityProvider = await this.priorityRepo.getHighestPriorityProvider(
      userId,
      WearableDataCategory.HEALTH_METRICS,
    );

    // Metrics to sync: heart_rate (for resting HR), hrv
    const metricTypes = ['heart_rate', 'hrv'];

    for (const metricType of metricTypes) {
      try {
        const metricsResponse = await this.openWearablesService.getTimeSeries(owUserId, metricType, {
          startDate,
          endDate,
          limit: 1000,
        });

        // Group by date and provider, take daily averages
        const dailyMetrics = this.aggregateDailyMetrics(metricsResponse.items);

        for (const [key, data] of dailyMetrics) {
          try {
            const [dateStr, providerStr] = key.split('|');
            const provider = this.openWearablesService.mapToWearableProvider(providerStr);
            if (!provider) continue;

            // Check if this provider is connected and supports health metrics
            const connection = connections.find(
              (c) => c.provider === provider && c.supported_categories.includes(WearableDataCategory.HEALTH_METRICS),
            );
            if (!connection) continue;

            // If priority is set and this isn't the priority provider, skip
            if (priorityProvider && provider !== priorityProvider) {
              continue;
            }

            const healthMetricType = this.mapToHealthMetricType(metricType);
            if (!healthMetricType) continue;

            const metric: NewDailyHealthMetric = {
              user_id: userId,
              metric_date: new Date(dateStr),
              metric_type: healthMetricType,
              value: String(data.avgValue),
              unit: data.unit,
              provider,
              external_id: `${dateStr}_${metricType}_${provider}`,
              recorded_at: new Date(),
            };

            await this.healthMetricRepo.upsert(metric);
            synced++;
          } catch (error) {
            this.logger.error(`Failed to save health metric: ${error}`);
            errors++;
          }
        }
      } catch (error) {
        this.logger.error(`Failed to fetch ${metricType} from OpenWearables: ${error}`);
        errors++;
      }
    }

    return { synced, errors };
  }

  /**
   * Sync activity data (steps, calories, distance) from OpenWearables
   */
  private async syncActivity(
    userId: string,
    owUserId: string,
    connections: WearableProviderConnection[],
    startDate: string,
    endDate: string,
  ): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    // Get priority provider for activity
    const priorityProvider = await this.priorityRepo.getHighestPriorityProvider(userId, WearableDataCategory.ACTIVITY);

    try {
      const aggregates = await this.openWearablesService.getActivityAggregates(owUserId, {
        startDate,
        endDate,
      });

      for (const aggregate of aggregates) {
        try {
          const provider = this.openWearablesService.mapToWearableProvider(aggregate.source);
          if (!provider) continue;

          // Check if this provider is connected
          const connection = connections.find((c) => c.provider === provider);
          if (!connection) continue;

          // If priority is set and this isn't the priority provider, skip
          if (priorityProvider && provider !== priorityProvider) {
            continue;
          }

          const activityDate = new Date(aggregate.activity_date);

          // Sync steps
          if (aggregate.steps_sum !== undefined && aggregate.steps_sum > 0) {
            const stepsMetric: NewDailyHealthMetric = {
              user_id: userId,
              metric_date: activityDate,
              metric_type: HealthMetricType.STEPS,
              value: String(aggregate.steps_sum),
              unit: 'steps',
              provider,
              external_id: `${aggregate.activity_date}_steps_${provider}`,
              recorded_at: new Date(),
            };
            await this.healthMetricRepo.upsert(stepsMetric);
            synced++;
          }

          // Sync active calories
          if (aggregate.active_energy_sum !== undefined && aggregate.active_energy_sum > 0) {
            const caloriesMetric: NewDailyHealthMetric = {
              user_id: userId,
              metric_date: activityDate,
              metric_type: HealthMetricType.ACTIVE_CALORIES,
              value: String(Math.round(aggregate.active_energy_sum)),
              unit: 'kcal',
              provider,
              external_id: `${aggregate.activity_date}_calories_${provider}`,
              recorded_at: new Date(),
            };
            await this.healthMetricRepo.upsert(caloriesMetric);
            synced++;
          }

          // Sync distance
          if (aggregate.distance_sum !== undefined && aggregate.distance_sum > 0) {
            const distanceMetric: NewDailyHealthMetric = {
              user_id: userId,
              metric_date: activityDate,
              metric_type: HealthMetricType.DISTANCE,
              value: String(Math.round(aggregate.distance_sum)),
              unit: 'meters',
              provider,
              external_id: `${aggregate.activity_date}_distance_${provider}`,
              recorded_at: new Date(),
            };
            await this.healthMetricRepo.upsert(distanceMetric);
            synced++;
          }
        } catch (error) {
          this.logger.error(`Failed to sync activity for ${aggregate.activity_date}: ${error}`);
          errors++;
        }
      }
    } catch (error) {
      this.logger.error(`Failed to fetch activity aggregates from OpenWearables: ${error}`);
      errors++;
    }

    return { synced, errors };
  }

  /**
   * Aggregate time series data to daily averages
   */
  private aggregateDailyMetrics(items: OWTimeSeries[]): Map<string, { avgValue: number; unit: string; count: number }> {
    const dailyData = new Map<string, { sum: number; count: number; unit: string }>();

    for (const item of items) {
      const dateStr = format(parseISO(item.timestamp), 'yyyy-MM-dd');
      const provider = item.source?.provider || 'unknown';
      const key = `${dateStr}|${provider}`;

      const existing = dailyData.get(key) || { sum: 0, count: 0, unit: item.unit };
      existing.sum += item.value;
      existing.count++;
      dailyData.set(key, existing);
    }

    const result = new Map<string, { avgValue: number; unit: string; count: number }>();
    for (const [key, data] of dailyData) {
      result.set(key, {
        avgValue: Math.round(data.sum / data.count),
        unit: data.unit,
        count: data.count,
      });
    }

    return result;
  }

  /**
   * Map OpenWearables metric type to our HealthMetricType
   */
  private mapToHealthMetricType(owType: string): HealthMetricType | null {
    const mapping: Record<string, HealthMetricType> = {
      heart_rate: HealthMetricType.RESTING_HEART_RATE,
      hrv: HealthMetricType.HRV,
      body_battery: HealthMetricType.BODY_BATTERY,
      readiness: HealthMetricType.READINESS_SCORE,
      strain: HealthMetricType.STRAIN_SCORE,
      recovery: HealthMetricType.RECOVERY_SCORE,
      stress: HealthMetricType.STRESS_SCORE,
      sleep_score: HealthMetricType.SLEEP_SCORE,
      vo2_max: HealthMetricType.VO2_MAX,
      respiratory_rate: HealthMetricType.RESPIRATORY_RATE,
      blood_oxygen: HealthMetricType.BLOOD_OXYGEN,
    };
    return mapping[owType.toLowerCase()] || null;
  }

  /**
   * Trigger sync for a specific provider
   */
  async triggerProviderSync(userId: string, provider: WearableProvider): Promise<void> {
    const connection = await this.connectionRepo.findByUserAndProvider(userId, provider);
    if (!connection || !connection.is_active) {
      throw new Error(`No active connection for provider ${provider}`);
    }

    try {
      await this.openWearablesService.triggerSync(connection.openwearables_user_id, provider);
      this.logger.log(`Triggered sync for ${provider} for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to trigger sync for ${provider}: ${error}`);
      throw error;
    }
  }
}
