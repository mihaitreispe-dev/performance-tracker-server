import { DynamicModule, Module } from '@nestjs/common';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { DailyTrainingLoadRepository } from 'src/repositories/daily-training-load.repository';
import { ExecutionWeatherRepository } from 'src/repositories/execution-weather.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseInstanceRepository } from 'src/repositories/exercise-instance.repository';
import { MuscleGroupRepository } from 'src/repositories/muscle-group.repository';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { UserSettingsRepository } from 'src/repositories/user-settings.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { AnalyticsApiController } from './analytics-api.controller';
import { AnalyticsApiService } from './analytics-api.service';

@Module({})
export class AnalyticsApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: AnalyticsApiModule,
        providers: [
          AnalyticsApiService,
          WorkoutExecutionRepository,
          SetCompletionRepository,
          CardioMetricsRepository,
          WorkoutRouteRepository,
          WorkoutScheduleRepository,
          WorkoutRepository,
          ExerciseInstanceRepository,
          ExerciseRepository,
          UserSettingsRepository,
          MuscleGroupRepository,
          DailyTrainingLoadRepository,
          PersonalRecordRepository,
          ExecutionWeatherRepository,
        ],
        controllers: [AnalyticsApiController],
      };
    }
    return this.instance;
  }
}
