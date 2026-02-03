import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/config/app-config.module';

import { MediaConvertService } from './mediaconvert.service';

@Module({})
export class MediaConvertModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: MediaConvertModule,
        imports: [AppConfigModule.register()],
        providers: [MediaConvertService],
        exports: [MediaConvertService],
      };
    }
    return this.instance;
  }
}
