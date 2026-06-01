import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  ContentItem,
  ContentItemKind,
  ContentItemStatus,
  ContentItemUpdate,
  Database,
  NewContentItem,
} from 'src/database/interfaces';

export interface ContentItemFilter {
  organisationId: string;
  kind?: ContentItemKind | ContentItemKind[];
  status?: ContentItemStatus | ContentItemStatus[];
  ownerUserId?: string;
  tag?: string;
}

@Injectable()
export class ContentItemRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<ContentItem | undefined> {
    return this.db.selectFrom('content_items').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByIdInOrg(id: string, organisationId: string): Promise<ContentItem | undefined> {
    return this.db
      .selectFrom('content_items')
      .where('id', '=', id)
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .executeTakeFirst();
  }

  async findByIds(ids: string[]): Promise<ContentItem[]> {
    if (ids.length === 0) return [];
    return this.db.selectFrom('content_items').where('id', 'in', ids).selectAll().execute();
  }

  async list(
    filter: ContentItemFilter,
    pagination?: { limit?: number; offset?: number },
  ): Promise<ContentItem[]> {
    let query = this.db
      .selectFrom('content_items')
      .where('organisation_id', '=', filter.organisationId)
      .selectAll();

    if (filter.kind) {
      query = Array.isArray(filter.kind)
        ? query.where('kind', 'in', filter.kind)
        : query.where('kind', '=', filter.kind);
    }
    if (filter.status) {
      query = Array.isArray(filter.status)
        ? query.where('status', 'in', filter.status)
        : query.where('status', '=', filter.status);
    }
    if (filter.ownerUserId) {
      query = query.where('owner_user_id', '=', filter.ownerUserId);
    }
    if (filter.tag) {
      query = query.where(sql<boolean>`${sql.ref('tags')} @> ARRAY[${sql.lit(filter.tag)}]::text[]`);
    }

    return query
      .orderBy('created_at', 'desc')
      .limit(pagination?.limit ?? 100)
      .offset(pagination?.offset ?? 0)
      .execute();
  }

  async create(data: NewContentItem): Promise<ContentItem> {
    return this.db.insertInto('content_items').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: ContentItemUpdate): Promise<ContentItem> {
    return this.db
      .updateTable('content_items')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('content_items').where('id', '=', id).execute();
  }

  /**
   * Cron-facing claim query: rows where the local-transcode worker
   * needs to produce the 9:16 companion. Pulls `pending=true` rows
   * whose claim is either fresh-null or stale-past-the-timeout, so a
   * dead worker doesn't strand a row. Caller is responsible for
   * stamping `transcode_started_at` to actually claim — this just
   * surfaces the queue.
   */
  async findManyTranscodePending(claimTimeoutMinutes = 10): Promise<ContentItem[]> {
    // sql<Date> typed so the where-clause type-checks against the
    // transcode_started_at column without resorting to `as any`. interval
    // is hand-rendered (sql.raw) because the value is a known integer
    // constant, not user input — keeps Kysely's parameter binder out of
    // the way of Postgres's interval-literal grammar.
    const staleCutoff = sql<Date>`now() - interval '${sql.raw(String(claimTimeoutMinutes))} minutes'`;
    return this.db
      .selectFrom('content_items')
      .selectAll()
      .where('transcode_pending', '=', true)
      .where((eb) =>
        eb.or([eb('transcode_started_at', 'is', null), eb('transcode_started_at', '<', staleCutoff)]),
      )
      .orderBy('created_at', 'asc')
      .limit(5)
      .execute();
  }
}
