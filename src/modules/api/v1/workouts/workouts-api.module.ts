import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { AthletePrivacySettingsRepository } from 'src/repositories/athlete-privacy-settings.repository';
import { CardioCategoryRepository } from 'src/repositories/cardio-category.repository';
import { CardioStepRepository } from 'src/repositories/cardio-step.repository';
import { CardioStepGroupRepository } from 'src/repositories/cardio-step-group.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseImageRepository } from 'src/repositories/exercise-image.repository';
import { ExerciseInstanceRepository } from 'src/repositories/exercise-instance.repository';
import { ExerciseInstanceGroupRepository } from 'src/repositories/exercise-instance-group.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { FitGeneratorService } from './fit-generator.service';
import { WorkoutExportController } from './workout-export.controller';
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
          FitGeneratorService,
          WorkoutRepository,
          WorkoutScheduleRepository,
          CoachAthleteRelationshipRepository,
          AthletePrivacySettingsRepository,
          ExerciseInstanceRepository,
          ExerciseInstanceGroupRepository,
          ExerciseRepository,
          ExerciseImageRepository,
          CardioStepRepository,
          CardioStepGroupRepository,
          CardioCategoryRepository,
        ],
        controllers: [WorkoutsApiController, WorkoutExportController],
        exports: [WorkoutsApiService],
      };
    }
    return this.instance;
  }
}
