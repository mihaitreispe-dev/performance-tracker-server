import { DynamicModule, Module } from '@nestjs/common';
import { AppAccessControlModule } from 'src/modules/app-access-control/app-access-control.module';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { MediaConvertModule } from 'src/modules/mediaconvert/mediaconvert.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { SmartCropModule } from 'src/modules/smart-crop/smart-crop.module';
import { VimeoModule } from 'src/modules/vimeo/vimeo.module';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { EquipmentRepository } from 'src/repositories/equipment.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseChainRepository } from 'src/repositories/exercise-chain.repository';
import { ExerciseImageRepository } from 'src/repositories/exercise-image.repository';
import { MuscleGroupRepository } from 'src/repositories/muscle-group.repository';

import { ExercisesApiController } from './exercises-api.controller';
import { ExercisesApiService } from './exercises-api.service';

@Module({})
export class ExercisesApiModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: ExercisesApiModule,
        imports: [
          S3Module.register(),
          AppConfigModule.register(),
          AppAccessControlModule.register(),
          MediaConvertModule.register(),
          VimeoModule.register(),
          SmartCropModule.register(),
        ],
        providers: [
          ExercisesApiService,
          ExerciseRepository,
          EquipmentRepository,
          MuscleGroupRepository,
          ExerciseImageRepository,
          ExerciseChainRepository,
          ContentItemRepository,
        ],
        controllers: [ExercisesApiController],
      };
    }
    return this.instance;
  }
}
