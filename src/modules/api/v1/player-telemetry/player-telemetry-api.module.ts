import { DynamicModule, Module } from '@nestjs/common';
import { PlayerQoeEventRepository } from 'src/repositories/player-qoe-event.repository';

import { PlayerTelemetryApiController } from './player-telemetry-api.controller';
import { PlayerTelemetryApiService } from './player-telemetry-api.service';

@Module({})
export class PlayerTelemetryApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: PlayerTelemetryApiModule,
        providers: [PlayerTelemetryApiService, PlayerQoeEventRepository],
        controllers: [PlayerTelemetryApiController],
      };
    }
    return this.instance;
  }
}
