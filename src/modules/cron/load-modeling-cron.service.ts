import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoadModelParametersRepository } from 'src/repositories/load-model-parameters.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { BayesianParameterService } from '../api/v1/advanced-metrics/services/bayesian-parameter.service';
import { HrvBaselineService } from '../api/v1/advanced-metrics/services/hrv-baseline.service';
import { MultiStreamLoadService } from '../api/v1/advanced-metrics/services/multi-stream-load.service';
import { ReadinessService } from '../api/v1/advanced-metrics/services/readiness.service';

@Injectable()
export class LoadModelingCronService {
  private readonly logger = new Logger(LoadModelingCronService.name);

  private readonly MIN_DATA_POINTS_FOR_UPDATE = 14;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly loadModelParametersRepository: LoadModelParametersRepository,
    private readonly hrvBaselineService: HrvBaselineService,
    private readonly multiStreamLoadService: MultiStreamLoadService,
    private readonly readinessService: ReadinessService,
    private readonly bayesianParameterService: BayesianParameterService,
  ) {}

  /**
   * Daily at 5 AM: Calculate HRV baselines, multi-stream loads, and readiness
   */
  @Cron('0 5 * * *')
  async calculateDailyMetrics() {
    this.logger.log('Starting daily load modeling calculations');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    try {
      // Get all users with recent activity
      const activeUserIds = await this.getActiveUserIds();
      this.logger.log(`Processing ${activeUserIds.length} active users`);

      for (const userId of activeUserIds) {
        try {
          // 1. Calculate HRV baseline for today
          await this.hrvBaselineService.calculateBaseline(userId, today);

          // 2. Record prediction error (compares yesterday's prediction to today's actual HRV)
          await this.bayesianParameterService.recordPredictionError(userId, today);

          // 3. Calculate multi-stream loads for yesterday
          await this.multiStreamLoadService.calculateDailyLoads(userId, yesterday);

          // 4. Calculate readiness for today
          await this.readinessService.calculateDailyReadiness(userId, today);

          this.logger.debug(`Completed daily metrics for user ${userId}`);
        } catch (error) {
          this.logger.error(`Failed to calculate daily metrics for user ${userId}`, error);
        }
      }

      this.logger.log('Daily load modeling calculations completed');
    } catch (error) {
      this.logger.error('Failed to run daily load modeling calculations', error);
    }
  }

  /**
   * Weekly on Sunday at 6 AM: Update Bayesian parameters for users with sufficient data
   */
  @Cron('0 6 * * 0')
  async updateBayesianParameters() {
    this.logger.log('Starting weekly Bayesian parameter updates');

    try {
      // Get users with sufficient data for parameter updates
      const eligibleUserIds = await this.loadModelParametersRepository.getAllUsersWithSufficientData(
        this.MIN_DATA_POINTS_FOR_UPDATE,
      );

      this.logger.log(`Updating parameters for ${eligibleUserIds.length} eligible users`);

      let updatedCount = 0;
      let rolledBackCount = 0;

      for (const userId of eligibleUserIds) {
        try {
          // Update parameters
          const result = await this.bayesianParameterService.updateParametersWeekly(userId);

          if (result.updated) {
            updatedCount++;
            this.logger.debug(
              `Updated parameters for user ${userId}: confidence=${result.confidence?.toFixed(2)}, mae7=${result.mae7day?.toFixed(2)}`,
            );

            // Check if rollback needed
            const rollbackResult = await this.bayesianParameterService.rollbackIfNeeded(userId);
            if (rollbackResult.rolledBack) {
              rolledBackCount++;
              this.logger.warn(`Rolled back parameters for user ${userId}: ${rollbackResult.reason}`);
            }
          } else {
            this.logger.debug(`Skipped parameter update for user ${userId}: ${result.reason}`);
          }
        } catch (error) {
          this.logger.error(`Failed to update parameters for user ${userId}`, error);
        }
      }

      this.logger.log(
        `Weekly Bayesian parameter updates completed: ${updatedCount} updated, ${rolledBackCount} rolled back`,
      );
    } catch (error) {
      this.logger.error('Failed to run weekly Bayesian parameter updates', error);
    }
  }

  /**
   * Monthly on 1st at 3 AM: Backfill any missing historical data
   */
  @Cron('0 3 1 * *')
  async monthlyBackfill() {
    this.logger.log('Starting monthly backfill for missing data');

    try {
      const activeUserIds = await this.getActiveUserIds();
      this.logger.log(`Checking backfill for ${activeUserIds.length} users`);

      for (const userId of activeUserIds) {
        try {
          // Backfill last 30 days of HRV baselines
          await this.hrvBaselineService.backfillHistory(userId, 30);

          // Backfill last 30 days of multi-stream loads
          await this.multiStreamLoadService.backfillHistory(userId, 30);

          this.logger.debug(`Completed backfill for user ${userId}`);
        } catch (error) {
          this.logger.error(`Failed to backfill data for user ${userId}`, error);
        }
      }

      this.logger.log('Monthly backfill completed');
    } catch (error) {
      this.logger.error('Failed to run monthly backfill', error);
    }
  }

  /**
   * Get active user IDs (users who have logged in recently or have recent workouts)
   */
  private async getActiveUserIds(): Promise<string[]> {
    // Get users who have logged in within the last 7 days
    const users = await this.userRepository.findRecentlyActive(7);
    return users.map((u) => u.id);
  }
}
