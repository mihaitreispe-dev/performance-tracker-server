import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { DailyHealthMetricRepository } from 'src/repositories/daily-health-metric.repository';
import { DailyTrainingLoadRepository } from 'src/repositories/daily-training-load.repository';
import { DataExportJobRepository } from 'src/repositories/data-export-job.repository';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';
import { SleepLogRepository } from 'src/repositories/sleep-log.repository';
import { UserSettingsRepository } from 'src/repositories/user-settings.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';

import { DataExportController } from './data-export.controller';
import { DataExportService } from './data-export.service';
import { CsvExporter } from './exporters/csv.exporter';
import { JsonExporter } from './exporters/json.exporter';

@Module({})
export class DataExportApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: DataExportApiModule,
        imports: [AppConfigModule.register(), S3Module.register()],
        providers: [
          DataExportService,
          CsvExporter,
          JsonExporter,
          DataExportJobRepository,
          WorkoutRepository,
          WorkoutExecutionRepository,
          CardioMetricsRepository,
          WorkoutRouteRepository,
          DailyHealthMetricRepository,
          PersonalRecordRepository,
          DailyTrainingLoadRepository,
          UserSettingsRepository,
          SleepLogRepository,
        ],
        controllers: [DataExportController],
      };
    }
    return this.instance;
  }
}
