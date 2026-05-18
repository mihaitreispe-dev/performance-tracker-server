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
}
