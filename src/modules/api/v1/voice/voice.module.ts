import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/config/app-config.module';

import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

@Module({})
export class VoiceApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: VoiceApiModule,
        imports: [AppConfigModule.register()],
        providers: [VoiceService],
        controllers: [VoiceController],
      };
    }
    return this.instance;
  }
}
