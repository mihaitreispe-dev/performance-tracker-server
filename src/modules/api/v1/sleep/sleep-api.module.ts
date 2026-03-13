import { DynamicModule, Module } from '@nestjs/common';
import { SleepLogRepository } from 'src/repositories/sleep-log.repository';
import { WearableProviderPriorityRepository } from 'src/repositories/wearable-provider-priority.repository';

import { SleepApiController } from './sleep-api.controller';
import { SleepApiService } from './sleep-api.service';
import { SleepScoreService } from './sleep-score.service';

@Module({})
export class SleepApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: SleepApiModule,
        providers: [SleepApiService, SleepScoreService, SleepLogRepository, WearableProviderPriorityRepository],
        controllers: [SleepApiController],
      };
    }
    return this.instance;
  }
}
