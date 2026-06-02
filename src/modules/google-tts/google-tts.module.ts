import { Global, Module } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';
import { GoogleTtsService } from './google-tts.service';

/**
 * @Global so feature modules (exercises today, courses / snacks
 * tomorrow) inject GoogleTtsService directly without re-importing
 * the module each time. The service itself is lightweight — the
 * underlying SDK client only constructs on first use.
 */
@Global()
@Module({
  providers: [GoogleTtsService, AppConfigService],
  exports: [GoogleTtsService],
})
export class GoogleTtsModule {}
