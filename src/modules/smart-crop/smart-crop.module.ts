import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/config/app-config.module';

import { SmartCropService } from './smart-crop.service';

@Module({})
export class SmartCropModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: SmartCropModule,
        imports: [AppConfigModule.register()],
        providers: [SmartCropService],
        exports: [SmartCropService],
      };
    }
    return this.instance;
  }
}
