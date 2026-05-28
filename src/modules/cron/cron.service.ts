import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Exercise, ExerciseStatus } from 'src/database/interfaces';
import { s3Keys } from 'src/lib/util/s3-keys';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { LocalTranscodeService } from 'src/modules/local-transcode/local-transcode.service';
import { MediaConvertService } from 'src/modules/mediaconvert/mediaconvert.service';
import { WearableSyncService } from 'src/modules/openwearables/wearable-sync.service';
import type { PixelRect } from 'src/modules/smart-crop/crop-geometry';
import { SmartCropService } from 'src/modules/smart-crop/smart-crop.service';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { WearableProviderConnectionRepository } from 'src/repositories/wearable-provider-connection.repository';

/** Give up on Rekognition analysis after this long and encode without a crop. */
const SMART_CROP_TIMEOUT_MS = 15 * 60_000;
const WIDE_TARGET_ASPECT = 16 / 9;

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);
  constructor(
    private readonly exerciseRepo: ExerciseRepository,
    private readonly mediaConvertService: MediaConvertService,
    private readonly wearableSyncService: WearableSyncService,
    private readonly wearableConnectionRepo: WearableProviderConnectionRepository,
    private readonly smartCropService: SmartCropService,
    private readonly configService: AppConfigService,
    private readonly localTranscodeService: LocalTranscodeService,
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
   * Drive the smart-crop analysis phase: for exercises whose Rekognition job
   * is in flight (assets_pending, rekognition_job_id set, no MediaConvert job
   * yet), poll the job and — once it resolves (or times out) — create the
   * MediaConvert job with the computed 16:9 crop. Setting media_convert_job_id
   * hands the row off to syncExerciseMediaConvertStatus above. Durable across
   * restarts because the Rekognition job id lives on the row, not in memory.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async syncSmartCropAnalysis() {
    const analyzing = await this.exerciseRepo.findManyAnalyzingSmartCrop();
    for (const exercise of analyzing) {
      if (!exercise.rekognition_job_id) continue;
      try {
        // Flag turned off (or never on) while rows sit mid-analysis →
        // encode straight away without a crop so they don't get stuck.
        if (!this.smartCropService.enabled) {
          await this.createSmartCropEncodeJob(exercise, null);
          continue;
        }

        const result = await this.smartCropService.getDetectionCrop({
          jobId: exercise.rekognition_job_id,
          targetAspect: WIDE_TARGET_ASPECT,
        });

        if (result.status === 'in_progress') {
          if (this.smartCropTimedOut(exercise)) {
            this.logger.warn(`Smart-crop analysis timed out for exercise ${exercise.id}; encoding without crop`);
            await this.createSmartCropEncodeJob(exercise, null);
          }
          continue;
        }

        // 'done' (crop may be null if no person) or 'failed' → encode now.
        await this.createSmartCropEncodeJob(exercise, result.status === 'done' ? result.crop : null);
      } catch (error) {
        this.logger.error(`Failed to advance smart-crop analysis for exercise ${exercise.id}`, error);
      }
    }
  }

  private smartCropTimedOut(exercise: Exercise): boolean {
    if (!exercise.smart_crop_started_at) return false;
    const started = new Date(exercise.smart_crop_started_at as unknown as string).getTime();
    return Date.now() - started > SMART_CROP_TIMEOUT_MS;
  }

  /**
   * Create the MediaConvert job for an analysed exercise (crop applied to the
   * 16:9 outputs when present) and record its id so the encode-status cron
   * takes over. Marks ASSETS_FAILED if the job can't be created.
   */
  private async createSmartCropEncodeJob(exercise: Exercise, crop: PixelRect | null): Promise<void> {
    if (!exercise.video_s3_bucket || !exercise.video_s3_key) {
      await this.exerciseRepo.updateById(exercise.id, { status: ExerciseStatus.ASSETS_FAILED });
      return;
    }
    const s3Paths = s3Keys.content.exercise({ userId: exercise.user_id, exerciseId: exercise.id });
    const job = await this.mediaConvertService.createJob({
      inputURL: `s3://${exercise.video_s3_bucket}/${exercise.video_s3_key}`,
      outputS3Folder: `s3://${this.configService.s3ContentBucket}/${s3Paths.base}/`,
      wideCrop: crop ? { X: crop.x, Y: crop.y, Width: crop.width, Height: crop.height } : null,
    });
    if (job) {
      await this.exerciseRepo.updateById(exercise.id, { media_convert_job_id: job.Id });
      this.logger.log(
        `Smart-crop analysis complete for exercise ${exercise.id} → encode job ${job.Id} (crop: ${crop ? 'yes' : 'none'})`,
      );
    } else {
      await this.exerciseRepo.updateById(exercise.id, { status: ExerciseStatus.ASSETS_FAILED });
    }
  }

  /**
   * Local-dev: drain the local-transcode queue. Mirrors the smart-crop /
   * MediaConvert crons in shape — claim a small batch of rows that asked for
   * local ffmpeg encoding, run each to completion (or assets_failed). Durable
   * because the claim + pending flag live on the row, so a process restart
   * mid-transcode is picked back up after the 10-minute claim timeout.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async syncLocalTranscode() {
    if (!this.localTranscodeService.enabled) return;
    const pending = await this.exerciseRepo.findManyLocalTranscodePending();
    for (const exercise of pending) {
      try {
        await this.localTranscodeService.transcode(exercise);
      } catch (error) {
        // transcode() already flips the row to assets_failed + clears the
        // pending flag; this catch is just for cron-tick visibility.
        this.logger.error(
          `Local transcode failed for exercise ${exercise.id}: ${(error as Error).message}`,
        );
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
