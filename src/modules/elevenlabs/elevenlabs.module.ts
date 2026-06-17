import { Global, Module } from '@nestjs/common';

import { AppConfigModule } from '../config/app-config.module';
import { ElevenLabsSttService } from './elevenlabs-stt.service';

/**
 * ElevenLabs integration — Scribe STT today (Layer 1 transcription),
 * cloned-voice dub later (Layer 2). @Global so the translations feature
 * injects it without re-importing.
 */
@Global()
@Module({
  imports: [AppConfigModule.register()],
  providers: [ElevenLabsSttService],
  exports: [ElevenLabsSttService],
})
export class ElevenLabsModule {}
