import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';

import { Database } from 'src/database/interfaces/database.interface';
import {
  RaceEvent,
  NewRaceEvent,
  RaceEventUpdate,
  EventType,
  EventSource,
} from 'src/database/interfaces/race-events-table.interface';

export interface RaceEventFindManyOptions {
  filter?: {
    eventType?: EventType;
    source?: EventSource;
    startDate?: Date;
    endDate?: Date;
    locationCity?: string;
  };
  limit?: number;
  offset?: number;
}

@Injectable()
export class RaceEventRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<RaceEvent | undefined> {
    return this.db.selectFrom('race_events').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByExternalId(externalId: string, source: EventSource): Promise<RaceEvent | undefined> {
    return this.db
      .selectFrom('race_events')
      .where('external_id', '=', externalId)
      .where('source', '=', source)
      .selectAll()
      .executeTakeFirst();
  }

  async findMany(options: RaceEventFindManyOptions = {}): Promise<RaceEvent[]> {
    const { filter, limit, offset } = options;

    let query = this.db.selectFrom('race_events').selectAll();

    if (filter?.eventType) {
      query = query.where('event_type', '=', filter.eventType);
    }
    if (filter?.source) {
      query = query.where('source', '=', filter.source);
    }
    if (filter?.startDate) {
      query = query.where('date', '>=', filter.startDate);
    }
    if (filter?.endDate) {
      query = query.where('date', '<=', filter.endDate);
    }
    if (filter?.locationCity) {
      query = query.where('location_city', 'ilike', `%${filter.locationCity}%`);
    }

    query = query.orderBy('date', 'asc');

    if (limit) {
      query = query.limit(limit);
    }
    if (offset) {
      query = query.offset(offset);
    }

    return query.execute();
  }

  async create(data: NewRaceEvent): Promise<RaceEvent> {
    return this.db.insertInto('race_events').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async upsertByExternalId(data: NewRaceEvent): Promise<RaceEvent> {
    // Try to find existing
    if (data.external_id && data.source) {
      const existing = await this.findByExternalId(data.external_id, data.source);
      if (existing) {
        return this.updateById(existing.id, {
          ...data,
          cached_at: new Date(),
        });
      }
    }
    return this.create(data);
  }

  async updateById(id: string, data: RaceEventUpdate): Promise<RaceEvent> {
    return this.db
      .updateTable('race_events')
      .set({ ...data, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('race_events').where('id', '=', id).execute();
  }
}
