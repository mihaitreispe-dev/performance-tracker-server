import { DynamicModule, Module } from '@nestjs/common';
import { ConsoleModule } from 'nestjs-console';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { MigrateScheduleDatesService } from './migrate-schedule-dates.service';

@Module({})
export class MigrateScheduleDatesModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: MigrateScheduleDatesModule,
        imports: [ConsoleModule],
        providers: [MigrateScheduleDatesService, WorkoutScheduleRepository],
        exports: [MigrateScheduleDatesService],
      };
    }
    return this.instance;
  }
}
