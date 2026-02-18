import { DynamicModule, Module } from '@nestjs/common';
import { WorkoutPlanRepository } from 'src/repositories/workout-plan.repository';
import { WorkoutPlanItemRepository } from 'src/repositories/workout-plan-item.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';
import { WorkoutItemRepository } from 'src/repositories/workout-item.repository';

import { WorkoutPlansApiController } from './workout-plans-api.controller';
import { WorkoutPlansApiService } from './workout-plans-api.service';

@Module({})
export class WorkoutPlansApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: WorkoutPlansApiModule,
        providers: [
          WorkoutPlansApiService,
          WorkoutPlanRepository,
          WorkoutPlanItemRepository,
          WorkoutRepository,
          WorkoutScheduleRepository,
          WorkoutItemRepository,
        ],
        controllers: [WorkoutPlansApiController],
      };
    }
    return this.instance;
  }
}
