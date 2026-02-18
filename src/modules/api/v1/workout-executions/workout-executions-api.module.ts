import { DynamicModule, Module } from '@nestjs/common';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { WorkoutExecutionsApiController } from './workout-executions-api.controller';
import { WorkoutExecutionsApiService } from './workout-executions-api.service';

@Module({})
export class WorkoutExecutionsApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: WorkoutExecutionsApiModule,
        providers: [
          WorkoutExecutionsApiService,
          WorkoutExecutionRepository,
          SetCompletionRepository,
          CardioMetricsRepository,
          WorkoutRouteRepository,
          WorkoutScheduleRepository,
          WorkoutRepository,
        ],
        controllers: [WorkoutExecutionsApiController],
      };
    }
    return this.instance;
  }
}
