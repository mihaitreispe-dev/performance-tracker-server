import { DynamicModule, Module } from '@nestjs/common';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { DailyHealthMetricRepository } from 'src/repositories/daily-health-metric.repository';
import { FitnessFatigueRepository } from 'src/repositories/fitness-fatigue.repository';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { HrvBaselineRepository } from 'src/repositories/hrv-baseline.repository';
import { LoadModelParametersRepository } from 'src/repositories/load-model-parameters.repository';
import { MultiStreamLoadRepository } from 'src/repositories/multi-stream-load.repository';
import { RecoveryJournalRepository } from 'src/repositories/recovery-journal.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { TrainingStressRepository } from 'src/repositories/training-stress.repository';
import { UserSettingsRepository } from 'src/repositories/user-settings.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { AdvancedMetricsApiController } from './advanced-metrics-api.controller';
import { AdvancedMetricsApiService } from './advanced-metrics-api.service';
import { BayesianParameterService } from './services/bayesian-parameter.service';
import { FitnessFatigueService } from './services/fitness-fatigue.service';
import { HrvBaselineService } from './services/hrv-baseline.service';
import { MultiStreamLoadService } from './services/multi-stream-load.service';
import { ReadinessService } from './services/readiness.service';
import { TrainingStressService } from './services/training-stress.service';
import { Vo2MaxService } from './services/vo2max.service';

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
          HrvBaselineService,
          MultiStreamLoadService,
          ReadinessService,
          BayesianParameterService,
          // Repositories
          FitnessMetricsRepository,
          TrainingStressRepository,
          FitnessFatigueRepository,
          WorkoutExecutionRepository,
          WorkoutRouteRepository,
          WorkoutRepository,
          CardioMetricsRepository,
          UserSettingsRepository,
          MultiStreamLoadRepository,
          HrvBaselineRepository,
          RecoveryJournalRepository,
          LoadModelParametersRepository,
          DailyHealthMetricRepository,
          SetCompletionRepository,
          WorkoutScheduleRepository,
        ],
        controllers: [AdvancedMetricsApiController],
        exports: [
          AdvancedMetricsApiService,
          HrvBaselineService,
          MultiStreamLoadService,
          ReadinessService,
          BayesianParameterService,
          LoadModelParametersRepository,
        ],
      };
    }
    return this.instance;
  }
}
