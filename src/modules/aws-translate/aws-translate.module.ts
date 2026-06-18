import { Global, Module } from '@nestjs/common';

import { AppConfigModule } from '../config/app-config.module';
import { AwsTranslateService } from './aws-translate.service';

/**
 * @Global so the translations feature injects AwsTranslateService
 * without re-importing the module. AppConfigModule.register() reuses
 * the single env-bound config instance.
 */
@Global()
@Module({
  imports: [AppConfigModule.register()],
  providers: [AwsTranslateService],
  exports: [AwsTranslateService],
})
export class AwsTranslateModule {}
