import { DynamicModule, Module } from '@nestjs/common';

import { AppConfigModule } from '../config/app-config.module';
import { ElevenLabsModule } from '../elevenlabs/elevenlabs.module';
import { S3Module } from '../s3/s3.module';
import { TranslationsService } from './translations.service';

/**
 * The content-translation orchestrator. Pulls together ElevenLabs Dubbing
 * (transcribe + translate + re-voice in one job) and S3 (audio + caption
 * upload). Registered as a singleton DynamicModule so the API module and
 * the cron poller share one service instance — the cron dubs the rows the
 * API endpoints queue. ElevenLabs is @Global; importing it here keeps the
 * dependency explicit.
 */
@Module({})
export class TranslationsModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: TranslationsModule,
        imports: [AppConfigModule.register(), ElevenLabsModule, S3Module.register()],
        providers: [TranslationsService],
        exports: [TranslationsService],
      };
    }
    return this.instance;
  }
}
