import { DynamicModule, Module } from '@nestjs/common';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutItemRepository } from 'src/repositories/workout-item.repository';
import { WorkoutPlanRepository } from 'src/repositories/workout-plan.repository';
import { WorkoutPlanItemRepository } from 'src/repositories/workout-plan-item.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { WorkoutPlansApiController } from './workout-plans-api.controller';
import { WorkoutPlansApiService } from './workout-plans-api.service';
import { WorkoutsApiModule } from '../workouts/workouts-api.module';

@Module({})
export class WorkoutPlansApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: WorkoutPlansApiModule,
        imports: [WorkoutsApiModule.register()],
        providers: [
          WorkoutPlansApiService,
          WorkoutPlanRepository,
          WorkoutPlanItemRepository,
          WorkoutRepository,
          WorkoutScheduleRepository,
          WorkoutItemRepository,
        ],
        controllers: [WorkoutPlansApiController],
        exports: [WorkoutPlansApiService],
      };
    }
    return this.instance;
  }
}
