import { DynamicModule, Module } from '@nestjs/common';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseInstanceRepository } from 'src/repositories/exercise-instance.repository';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';

import { PersonalRecordsApiController } from './personal-records-api.controller';
import { PersonalRecordsApiService } from './personal-records-api.service';
import { PersonalRecordsDetectionService } from './personal-records-detection.service';

@Module({})
export class PersonalRecordsApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: PersonalRecordsApiModule,
        providers: [
          PersonalRecordsApiService,
          PersonalRecordsDetectionService,
          PersonalRecordRepository,
          ExerciseRepository,
          SetCompletionRepository,
          WorkoutRouteRepository,
          ExerciseInstanceRepository,
          WorkoutExecutionRepository,
        ],
        controllers: [PersonalRecordsApiController],
        exports: [PersonalRecordsDetectionService],
      };
    }
    return this.instance;
  }
}
