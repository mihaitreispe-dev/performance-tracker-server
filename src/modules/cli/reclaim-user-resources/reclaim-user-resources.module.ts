import { DynamicModule, Module } from '@nestjs/common';
import { ConsoleModule } from 'nestjs-console';

import { ReclaimUserResourcesService } from './reclaim-user-resources.service';

@Module({})
export class ReclaimUserResourcesModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: ReclaimUserResourcesModule,
        imports: [ConsoleModule],
        providers: [ReclaimUserResourcesService],
        exports: [ReclaimUserResourcesService],
      };
    }
    return this.instance;
  }
}
