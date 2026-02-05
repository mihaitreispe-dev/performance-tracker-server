import { HttpModule } from '@nestjs/axios';
import { DynamicModule, Module } from '@nestjs/common';
import { ConsoleModule } from 'nestjs-console';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { EquipmentRepository } from 'src/repositories/equipment.repository';
import { ExerciseImageRepository } from 'src/repositories/exercise-image.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { MuscleGroupRepository } from 'src/repositories/muscle-group.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { PopulateExercisesService } from './populate-exercises.service';

@Module({})
export class PopulateExercisesModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: PopulateExercisesModule,
        imports: [ConsoleModule, HttpModule, AppConfigModule.register(), S3Module.register()],
        providers: [
          PopulateExercisesService,
          ExerciseRepository,
          UserRepository,
          EquipmentRepository,
          MuscleGroupRepository,
          ExerciseImageRepository,
        ],
        exports: [PopulateExercisesService],
      };
    }
    return this.instance;
  }
}
