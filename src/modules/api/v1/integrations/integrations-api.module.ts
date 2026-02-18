import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { UserIntegrationRepository } from 'src/repositories/user-integration.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';

import { IntegrationsApiController } from './integrations-api.controller';
import { IntegrationsApiService } from './integrations-api.service';

@Module({})
export class IntegrationsApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: IntegrationsApiModule,
        imports: [AppConfigModule.register()],
        providers: [
          IntegrationsApiService,
          UserIntegrationRepository,
          WorkoutExecutionRepository,
          CardioMetricsRepository,
          WorkoutRouteRepository,
        ],
        controllers: [IntegrationsApiController],
      };
    }
    return this.instance;
  }
}
