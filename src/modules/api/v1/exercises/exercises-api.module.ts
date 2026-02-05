import { DynamicModule, Module } from '@nestjs/common';
import { AppAccessControlModule } from 'src/modules/app-access-control/app-access-control.module';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { MediaConvertModule } from 'src/modules/mediaconvert/mediaconvert.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { EquipmentRepository } from 'src/repositories/equipment.repository';
import { ExerciseImageRepository } from 'src/repositories/exercise-image.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
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
        imports: [S3Module.register(), AppConfigModule.register(), AppAccessControlModule.register(), MediaConvertModule.register()],
        providers: [ExercisesApiService, ExerciseRepository, EquipmentRepository, MuscleGroupRepository, ExerciseImageRepository],
        controllers: [ExercisesApiController],
      };
    }
    return this.instance;
  }
}
