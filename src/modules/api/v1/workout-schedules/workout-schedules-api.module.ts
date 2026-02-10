import { DynamicModule, Module } from '@nestjs/common';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';
import { WorkoutSchedulesApiController } from './workout-schedules-api.controller';
import { WorkoutSchedulesApiService } from './workout-schedules-api.service';

@Module({})
export class WorkoutSchedulesApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: WorkoutSchedulesApiModule,
        providers: [
          WorkoutSchedulesApiService,
          WorkoutScheduleRepository,
          WorkoutRepository,
        ],
        controllers: [WorkoutSchedulesApiController],
      };
    }
    return this.instance;
  }
}
