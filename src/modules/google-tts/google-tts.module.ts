import { Global, Module } from '@nestjs/common';

import { AppConfigModule } from '../config/app-config.module';
import { GoogleTtsService } from './google-tts.service';

/**
 * @Global so feature modules (exercises today, courses / snacks
 * tomorrow) inject GoogleTtsService directly without re-importing
 * the module each time. The service itself is lightweight — the
 * underlying SDK client only constructs on first use.
 *
 * AppConfigModule.register() is imported (NOT providers:
 * [AppConfigService]) so we reuse the single global instance bound
 * to the env-loaded ConfigModule. Providing AppConfigService
 * directly here would create a second instance disconnected from
 * env loading, and every reader would see undefined values.
 */
@Global()
@Module({
  imports: [AppConfigModule.register()],
  providers: [GoogleTtsService],
  exports: [GoogleTtsService],
})
export class GoogleTtsModule {}
