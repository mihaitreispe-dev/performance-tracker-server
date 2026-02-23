import { DynamicModule, Module } from '@nestjs/common';
import { SleepLogRepository } from 'src/repositories/sleep-log.repository';

import { SleepApiController } from './sleep-api.controller';
import { SleepApiService } from './sleep-api.service';

@Module({})
export class SleepApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: SleepApiModule,
        providers: [SleepApiService, SleepLogRepository],
        controllers: [SleepApiController],
      };
    }
    return this.instance;
  }
}
