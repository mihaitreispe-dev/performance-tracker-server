import { Global, Module } from '@nestjs/common';

import { AppConfigModule } from '../config/app-config.module';
import { ElevenLabsSttService } from './elevenlabs-stt.service';
import { ElevenLabsTtsService } from './elevenlabs-tts.service';

/**
 * ElevenLabs integration — Scribe STT (Layer 1 transcription) + TTS for
 * the cloned-voice dub (Layer 2). @Global so the translations feature
 * injects both without re-importing.
 */
@Global()
@Module({
  imports: [AppConfigModule.register()],
  providers: [ElevenLabsSttService, ElevenLabsTtsService],
  exports: [ElevenLabsSttService, ElevenLabsTtsService],
})
export class ElevenLabsModule {}
