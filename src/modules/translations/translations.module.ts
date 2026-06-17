import { DynamicModule, Module } from '@nestjs/common';

import { AppConfigModule } from '../config/app-config.module';
import { AwsTranscribeModule } from '../aws-transcribe/aws-transcribe.module';
import { AwsTranslateModule } from '../aws-translate/aws-translate.module';
import { ElevenLabsModule } from '../elevenlabs/elevenlabs.module';
import { S3Module } from '../s3/s3.module';
import { TranslationsService } from './translations.service';

/**
 * The content-translation orchestrator. Pulls together Translate
 * (machine translation), Transcribe (speech-to-text), and S3 (caption
 * upload). Registered as a singleton DynamicModule so the API module
 * and the cron poller share one service instance — the cron advances
 * the same Transcribe jobs the API endpoints kick off.
 *
 * AwsTranslate/AwsTranscribe modules are @Global, so they're available
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
          AwsTranscribeModule,
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
