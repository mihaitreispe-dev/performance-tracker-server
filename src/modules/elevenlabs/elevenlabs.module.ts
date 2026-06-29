import { Global, Module } from '@nestjs/common';

import { AppConfigModule } from '../config/app-config.module';
import { ElevenLabsDubbingService } from './elevenlabs-dubbing.service';
import { ElevenLabsSttService } from './elevenlabs-stt.service';
import { ElevenLabsTtsService } from './elevenlabs-tts.service';
import { ElevenLabsVoiceService } from './elevenlabs-voice.service';

/**
 * ElevenLabs integration — Dubbing (the content-translation pipeline:
 * transcribe + translate + re-voice in one async job), Scribe STT and TTS
 * (kept available for other callers), and voice management (Instant Voice
 * Clone enrollment). @Global so features inject these without re-importing.
 */
@Global()
@Module({
  imports: [AppConfigModule.register()],
  providers: [
    ElevenLabsDubbingService,
    ElevenLabsSttService,
    ElevenLabsTtsService,
    ElevenLabsVoiceService,
  ],
  exports: [
    ElevenLabsDubbingService,
    ElevenLabsSttService,
    ElevenLabsTtsService,
    ElevenLabsVoiceService,
  ],
})
export class ElevenLabsModule {}
