import { HttpModule } from '@nestjs/axios';
import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { DailyHealthMetricRepository } from 'src/repositories/daily-health-metric.repository';
import { SleepLogRepository } from 'src/repositories/sleep-log.repository';
import { WearableProviderConnectionRepository } from 'src/repositories/wearable-provider-connection.repository';
import { WearableProviderPriorityRepository } from 'src/repositories/wearable-provider-priority.repository';

import { OpenWearablesService } from './openwearables.service';
import { WearableSyncService } from './wearable-sync.service';

@Module({})
export class OpenWearablesModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: OpenWearablesModule,
        imports: [HttpModule, AppConfigModule.register()],
        providers: [
          OpenWearablesService,
          WearableSyncService,
          WearableProviderConnectionRepository,
          WearableProviderPriorityRepository,
          SleepLogRepository,
          DailyHealthMetricRepository,
        ],
        exports: [OpenWearablesService, WearableSyncService],
      };
    }
    return this.instance;
  }
}
