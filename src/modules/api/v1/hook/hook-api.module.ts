import { DynamicModule, Module } from '@nestjs/common';

import { HookApiController } from './hook-api.controller';

@Module({})
export class HookApiModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: HookApiModule,
        imports: [],
        providers: [],
        exports: [],
        controllers: [HookApiController],
      };
    }
    return this.instance;
  }
}
