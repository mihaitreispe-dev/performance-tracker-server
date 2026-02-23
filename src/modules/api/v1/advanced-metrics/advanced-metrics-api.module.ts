import { DynamicModule, Module } from '@nestjs/common';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { FitnessFatigueRepository } from 'src/repositories/fitness-fatigue.repository';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { TrainingStressRepository } from 'src/repositories/training-stress.repository';
import { UserSettingsRepository } from 'src/repositories/user-settings.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';

import { AdvancedMetricsApiController } from './advanced-metrics-api.controller';
import { AdvancedMetricsApiService } from './advanced-metrics-api.service';
import { Vo2MaxService } from './services/vo2max.service';
import { TrainingStressService } from './services/training-stress.service';
import { FitnessFatigueService } from './services/fitness-fatigue.service';

@Module({})
export class AdvancedMetricsApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: AdvancedMetricsApiModule,
        providers: [
          // API Service
          AdvancedMetricsApiService,
          // Calculation Services
          Vo2MaxService,
          TrainingStressService,
          FitnessFatigueService,
          // Repositories
          FitnessMetricsRepository,
          TrainingStressRepository,
          FitnessFatigueRepository,
          WorkoutExecutionRepository,
          WorkoutRouteRepository,
          WorkoutRepository,
          CardioMetricsRepository,
          UserSettingsRepository,
        ],
        controllers: [AdvancedMetricsApiController],
      };
    }
    return this.instance;
  }
}
