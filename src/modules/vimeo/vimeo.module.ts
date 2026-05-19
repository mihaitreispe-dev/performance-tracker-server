import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/config/app-config.module';

import { VimeoService } from './vimeo.service';

@Module({})
export class VimeoModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: VimeoModule,
        imports: [AppConfigModule.register()],
        providers: [VimeoService],
        exports: [VimeoService],
      };
    }
    return this.instance;
  }
}
