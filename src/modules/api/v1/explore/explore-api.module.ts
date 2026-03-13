import { DynamicModule, Module } from '@nestjs/common';
import { FitnessFatigueRepository } from 'src/repositories/fitness-fatigue.repository';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { HrvBaselineRepository } from 'src/repositories/hrv-baseline.repository';
import { MultiStreamLoadRepository } from 'src/repositories/multi-stream-load.repository';
import { QuickWellnessCheckinRepository } from 'src/repositories/quick-wellness-checkin.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { SleepLogRepository } from 'src/repositories/sleep-log.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';

import { ExploreApiController } from './explore-api.controller';
import { ExploreApiService } from './explore-api.service';

@Module({})
export class ExploreApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: ExploreApiModule,
        providers: [
          ExploreApiService,
          QuickWellnessCheckinRepository,
          FitnessFatigueRepository,
          MultiStreamLoadRepository,
          HrvBaselineRepository,
          SleepLogRepository,
          WorkoutExecutionRepository,
          WorkoutRouteRepository,
          SetCompletionRepository,
          FitnessMetricsRepository,
        ],
        controllers: [ExploreApiController],
        exports: [ExploreApiService],
      };
    }
    return this.instance;
  }
}
