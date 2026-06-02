import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewPlayerQoeEvent, PlayerQoeEvent } from 'src/database/interfaces';

/**
 * Telemetry sink for the workout player (spec F2). Always append; never
 * update. Bulk inserts because the client batches events between
 * intervals — one round-trip for 50 events beats 50 fetches.
 */
@Injectable()
export class PlayerQoeEventRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async insertMany(events: NewPlayerQoeEvent[]): Promise<PlayerQoeEvent[]> {
    if (events.length === 0) return [];
    return this.db
      .insertInto('player_qoe_events')
      .values(events)
      .returningAll()
      .execute();
  }
}
