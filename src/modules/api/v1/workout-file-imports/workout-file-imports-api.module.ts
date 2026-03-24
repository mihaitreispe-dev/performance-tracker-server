import { DynamicModule, Module } from '@nestjs/common';
import { S3Module } from 'src/modules/s3/s3.module';
import { WeatherModule } from 'src/modules/weather/weather.module';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { CardioStepRepository } from 'src/repositories/cardio-step.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutFileImportRepository } from 'src/repositories/workout-file-import.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { WorkoutFileImportsApiController } from './workout-file-imports-api.controller';
import { WorkoutFileImportsApiService } from './workout-file-imports-api.service';
import { WorkoutFileParserService } from './workout-file-parser.service';

@Module({})
export class WorkoutFileImportsApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: WorkoutFileImportsApiModule,
        imports: [S3Module.register(), WeatherModule.register()],
        providers: [
          WorkoutFileImportsApiService,
          WorkoutFileParserService,
          WorkoutFileImportRepository,
          WorkoutExecutionRepository,
          CardioMetricsRepository,
          WorkoutRouteRepository,
          WorkoutScheduleRepository,
          WorkoutRepository,
          CardioStepRepository,
        ],
        controllers: [WorkoutFileImportsApiController],
        exports: [WorkoutFileParserService],
      };
    }
    return this.instance;
  }
}
