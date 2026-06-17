import { DynamicModule, Module } from '@nestjs/common';

import { AppConfigModule } from 'src/modules/config/app-config.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { TranslationsModule } from 'src/modules/translations/translations.module';

import { TranslationsApiController } from './translations-api.controller';
import { TranslationsApiService } from './translations-api.service';

/**
 * Org-admin API for the content-translation pipeline: request machine
 * translations, list them, edit the machine output, and approve/publish.
 * The human review gate before any translated voice-over / caption
 * reaches an athlete.
 */
@Module({})
export class TranslationsApiModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: TranslationsApiModule,
        imports: [AppConfigModule.register(), S3Module.register(), TranslationsModule.register()],
        providers: [TranslationsApiService],
        controllers: [TranslationsApiController],
      };
    }
    return this.instance;
  }
}
