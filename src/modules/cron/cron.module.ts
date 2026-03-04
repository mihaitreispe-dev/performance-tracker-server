import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MediaConvertModule } from 'src/modules/mediaconvert/mediaconvert.module';
import { OpenWearablesModule } from 'src/modules/openwearables/openwearables.module';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { WearableProviderConnectionRepository } from 'src/repositories/wearable-provider-connection.repository';

import { CronService } from './cron.service';

@Module({
  imports: [ScheduleModule, MediaConvertModule.register(), OpenWearablesModule.register()],
  providers: [CronService, ExerciseRepository, WearableProviderConnectionRepository],
})
export class CronModule {}
