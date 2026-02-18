import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { CardioCategoryRepository } from 'src/repositories/cardio-category.repository';
import { CardioStepRepository } from 'src/repositories/cardio-step.repository';
import { CardioStepGroupRepository } from 'src/repositories/cardio-step-group.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseImageRepository } from 'src/repositories/exercise-image.repository';
import { ExerciseInstanceRepository } from 'src/repositories/exercise-instance.repository';
import { ExerciseInstanceGroupRepository } from 'src/repositories/exercise-instance-group.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';

import { WorkoutsApiController } from './workouts-api.controller';
import { WorkoutsApiService } from './workouts-api.service';

@Module({})
export class WorkoutsApiModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: WorkoutsApiModule,
        imports: [S3Module.register(), AppConfigModule.register()],
        providers: [
          WorkoutsApiService,
          WorkoutRepository,
          ExerciseInstanceRepository,
          ExerciseInstanceGroupRepository,
          ExerciseRepository,
          ExerciseImageRepository,
          CardioStepRepository,
          CardioStepGroupRepository,
          CardioCategoryRepository,
        ],
        controllers: [WorkoutsApiController],
      };
    }
    return this.instance;
  }
}
