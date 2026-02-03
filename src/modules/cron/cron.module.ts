import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MediaConvertModule } from 'src/modules/mediaconvert/mediaconvert.module';
import { ExerciseRepository } from 'src/repositories/exercise.repository';

import { CronService } from './cron.service';

@Module({
  imports: [ScheduleModule, MediaConvertModule.register()],
  providers: [CronService, ExerciseRepository],
})
export class CronModule {}
