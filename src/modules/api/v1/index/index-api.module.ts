import { DynamicModule, Module } from '@nestjs/common';

import { IndexApiController } from './index-api.controller';

@Module({})
export class IndexApiModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: IndexApiModule,
        imports: [],
        providers: [],
        exports: [],
        controllers: [IndexApiController],
      };
    }
    return this.instance;
  }
}
