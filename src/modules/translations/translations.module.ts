import { DynamicModule, Module } from '@nestjs/common';

import { AppConfigModule } from '../config/app-config.module';
import { AwsTranslateModule } from '../aws-translate/aws-translate.module';
import { ElevenLabsModule } from '../elevenlabs/elevenlabs.module';
import { S3Module } from '../s3/s3.module';
import { TranslationsService } from './translations.service';

/**
 * The content-translation orchestrator. Pulls together AWS Translate
 * (machine translation), ElevenLabs Scribe (speech-to-text), and S3
 * (caption upload). Registered as a singleton DynamicModule so the API
 * module and the cron poller share one service instance — the cron
 * transcribes + translates the rows the API endpoints queue.
 *
 * AwsTranslate / ElevenLabs modules are @Global, so they're available
 * app-wide; importing them here keeps the dependency explicit.
 */
@Module({})
export class TranslationsModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: TranslationsModule,
        imports: [
          AppConfigModule.register(),
          AwsTranslateModule,
          ElevenLabsModule,
          S3Module.register(),
        ],
        providers: [TranslationsService],
        exports: [TranslationsService],
      };
    }
    return this.instance;
  }
}
