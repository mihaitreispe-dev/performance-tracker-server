import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExerciseStatus } from 'src/database/interfaces';
import { MediaConvertService } from 'src/modules/mediaconvert/mediaconvert.service';
import { ExerciseRepository } from 'src/repositories/exercise.repository';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);
  constructor(
    private readonly exerciseRepo: ExerciseRepository,
    private readonly mediaConvertService: MediaConvertService,
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
}
