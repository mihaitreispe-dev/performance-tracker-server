import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { OpenWearablesModule } from 'src/modules/openwearables/openwearables.module';
import { DailyHealthMetricRepository } from 'src/repositories/daily-health-metric.repository';
import { OAuthStateRepository } from 'src/repositories/oauth-state.repository';
import { WearableProviderConnectionRepository } from 'src/repositories/wearable-provider-connection.repository';
import { WearableProviderPriorityRepository } from 'src/repositories/wearable-provider-priority.repository';

import { WearablesApiController } from './wearables-api.controller';
import { WearablesApiService } from './wearables-api.service';

@Module({})
export class WearablesApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: WearablesApiModule,
        imports: [AppConfigModule.register(), OpenWearablesModule.register()],
        providers: [
          WearablesApiService,
          WearableProviderConnectionRepository,
          WearableProviderPriorityRepository,
          OAuthStateRepository,
          DailyHealthMetricRepository,
        ],
        controllers: [WearablesApiController],
      };
    }
    return this.instance;
  }
}
