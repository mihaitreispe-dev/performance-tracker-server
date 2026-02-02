import { DynamicModule, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthApiController } from './health-api.controller';

@Module({})
export class HealthApiModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: HealthApiModule,
        imports: [TerminusModule],
        controllers: [HealthApiController],
      };
    }
    return this.instance;
  }
}
