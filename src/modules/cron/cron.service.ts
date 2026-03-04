import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExerciseStatus } from 'src/database/interfaces';
import { MediaConvertService } from 'src/modules/mediaconvert/mediaconvert.service';
import { WearableSyncService } from 'src/modules/openwearables/wearable-sync.service';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { WearableProviderConnectionRepository } from 'src/repositories/wearable-provider-connection.repository';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);
  constructor(
    private readonly exerciseRepo: ExerciseRepository,
    private readonly mediaConvertService: MediaConvertService,
    private readonly wearableSyncService: WearableSyncService,
    private readonly wearableConnectionRepo: WearableProviderConnectionRepository,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async syncExerciseMediaConvertStatus() {
    const exercises = await this.exerciseRepo.findManyWithPendingAssets();
    for (const exercise of exercises) {
      if (!exercise.media_convert_job_id) {
        continue;
      }
      try {
        const job = await this.mediaConvertService.getJob(exercise.media_convert_job_id);
        if (!job || !job.Status) {
          continue;
        }
        switch (job.Status) {
          case 'COMPLETE':
            await this.exerciseRepo.updateById(exercise.id, { status: ExerciseStatus.ASSETS_DONE });
            this.logger.log(`Exercise ${exercise.id} video processing complete`);
            break;
          case 'ERROR':
            await this.exerciseRepo.updateById(exercise.id, { status: ExerciseStatus.ASSETS_FAILED });
            this.logger.warn(`Exercise ${exercise.id} video processing failed`);
            break;
          case 'CANCELED':
            await this.exerciseRepo.updateById(exercise.id, { status: ExerciseStatus.ASSETS_CANCELED });
            this.logger.log(`Exercise ${exercise.id} video processing canceled`);
            break;
        }
      } catch (error) {
        this.logger.error(`Failed to sync MediaConvert status for exercise ${exercise.id}`, error);
      }
    }
  }

  /**
   * Sync wearable data for all users with active connections
   * Runs daily at 4:00 AM
   */
  @Cron('0 4 * * *')
  async syncWearableData() {
    this.logger.log('Starting daily wearable data sync');

    try {
      // Get all active connections grouped by user
      const connections = await this.wearableConnectionRepo.findMany({ isActive: true });

      // Group by user ID
      const userIds = [...new Set(connections.map((c) => c.user_id))];

      this.logger.log(`Syncing wearable data for ${userIds.length} users`);

      for (const userId of userIds) {
        try {
          const result = await this.wearableSyncService.syncAllForUser(userId, 2); // Sync last 2 days
          this.logger.log(
            `Synced for user ${userId}: workouts=${result.workouts.synced}, sleep=${result.sleep.synced}, metrics=${result.healthMetrics.synced}`,
          );
        } catch (error) {
          this.logger.error(`Failed to sync wearable data for user ${userId}`, error);
        }
      }

      this.logger.log('Daily wearable data sync completed');
    } catch (error) {
      this.logger.error('Failed to run daily wearable sync', error);
    }
  }
}
