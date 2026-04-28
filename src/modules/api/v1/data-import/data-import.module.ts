import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { DataImportJobRepository } from 'src/repositories/data-import-job.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';

import { WorkoutFileParserService } from '../workout-file-imports/workout-file-parser.service';
import { DataImportController } from './data-import.controller';
import { DataImportService } from './data-import.service';
import { GarminArchiveProcessor } from './garmin-archive.processor';

@Module({})
export class DataImportApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: DataImportApiModule,
        imports: [AppConfigModule.register(), S3Module.register()],
        providers: [
          DataImportService,
          GarminArchiveProcessor,
          WorkoutFileParserService,
          DataImportJobRepository,
          WorkoutExecutionRepository,
          CardioMetricsRepository,
          WorkoutRouteRepository,
        ],
        controllers: [DataImportController],
      };
    }
    return this.instance;
  }
}
