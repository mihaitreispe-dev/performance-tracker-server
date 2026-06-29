import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { TranslationsService } from 'src/modules/translations/translations.service';

/**
 * Drives the ElevenLabs Dubbing pipeline for content translations. Phase 1
 * creates a dubbing job per queued locale; phase 2 polls in-flight jobs and
 * publishes finished ones. The job handle (`dub_job_id`) lives on the
 * content_translations row, so a process restart resumes cleanly. No-ops
 * when ElevenLabs is disabled.
 */
@Injectable()
export class TranslationsCronService {
  private readonly logger = new Logger(TranslationsCronService.name);

  constructor(private readonly translationsService: TranslationsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async createDubbingJobs() {
    try {
      await this.translationsService.createPendingDubbingJobs();
    } catch (error) {
      this.logger.error('Failed to create translation dubbing jobs', error as Error);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async finalizeDubbingJobs() {
    try {
      await this.translationsService.finalizeDubbingJobs();
    } catch (error) {
      this.logger.error('Failed to finalize translation dubbing jobs', error as Error);
    }
  }
}
