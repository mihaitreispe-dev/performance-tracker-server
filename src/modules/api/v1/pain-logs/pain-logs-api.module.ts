import { DynamicModule, Module } from '@nestjs/common';
import { PainLogRepository } from 'src/repositories/pain-log.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';

import { PainLogsApiController } from './pain-logs-api.controller';
import { PainLogsApiService } from './pain-logs-api.service';

@Module({})
export class PainLogsApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: PainLogsApiModule,
        providers: [PainLogsApiService, PainLogRepository, WorkoutExecutionRepository],
        controllers: [PainLogsApiController],
      };
    }
    return this.instance;
  }
}
