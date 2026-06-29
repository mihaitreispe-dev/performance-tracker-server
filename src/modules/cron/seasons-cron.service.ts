import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { SeasonStatus } from 'src/database/interfaces';
import { toDayString } from 'src/modules/api/v1/progression/progression.math';
import { todayString } from 'src/modules/api/v1/progression/quest-window';
import { SeasonRepository } from 'src/repositories/season.repository';

/**
 * Rolls the global season calendar's lifecycle status by date (upcoming →
 * active → ended). Seasons are global reference data (no org, no RLS), so this
 * just reconciles each season's stored status against today's window. Season
 * POINTS are derived (XP-ledger window sum) and seasonal cosmetic grants happen
 * in ProgressionApiService.award() — this cron is only the calendar roll.
 */
@Injectable()
export class SeasonsCronService {
  private readonly logger = new Logger(SeasonsCronService.name);

  constructor(private readonly seasonRepo: SeasonRepository) {}

  @Cron('0 4 * * *')
  async rollSeasons(): Promise<void> {
    try {
      const today = todayString();
      const seasons = await this.seasonRepo.list();
      for (const s of seasons) {
        const startsOn = toDayString(s.starts_on)!;
        const endsOn = toDayString(s.ends_on)!;
        const desired =
          today < startsOn ? SeasonStatus.UPCOMING : today > endsOn ? SeasonStatus.ENDED : SeasonStatus.ACTIVE;
        if (s.status !== desired) {
          await this.seasonRepo.setStatus(s.id, desired);
          this.logger.log(`Season ${s.slug} → ${desired}`);
        }
      }
    } catch (e) {
      this.logger.error(`Season roll failed: ${String(e)}`);
    }
  }
}
