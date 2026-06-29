import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, Season, SeasonStatus } from 'src/database/interfaces';

/** Global season calendar (no org, no RLS). See migration 1774405200000. */
@Injectable()
export class SeasonRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  /**
   * The season whose [starts_on, ends_on] window contains `today` ('YYYY-MM-DD').
   * Window-based (not status-based) so it's correct even if the daily cron roll
   * hasn't run yet. Newest start wins on the off chance windows overlap.
   */
  async findActive(today: string): Promise<Season | undefined> {
    return this.db
      .selectFrom('seasons')
      .where(sql<boolean>`starts_on <= ${today}::date AND ends_on >= ${today}::date`)
      .selectAll()
      .orderBy('starts_on', 'desc')
      .executeTakeFirst();
  }

  async findById(id: string): Promise<Season | undefined> {
    return this.db.selectFrom('seasons').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async list(): Promise<Season[]> {
    return this.db.selectFrom('seasons').selectAll().orderBy('starts_on', 'asc').execute();
  }

  /** Cron: flip a season's lifecycle status. */
  async setStatus(id: string, status: SeasonStatus): Promise<void> {
    await this.db
      .updateTable('seasons')
      .set({ status, updated_at: sql`now()` })
      .where('id', '=', id)
      .execute();
  }
}
