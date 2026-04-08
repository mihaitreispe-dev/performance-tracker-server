import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, Food, FoodSource, NewFood, FoodUpdate } from 'src/database/interfaces';

export interface FoodSearchOptions {
  query?: string;
  source?: FoodSource;
  limit?: number;
  offset?: number;
}

@Injectable()
export class FoodRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<Food | undefined> {
    return this.db.selectFrom('foods').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findByExternalId(externalId: string): Promise<Food | undefined> {
    return this.db.selectFrom('foods').selectAll().where('external_id', '=', externalId).executeTakeFirst();
  }

  async findByBarcode(barcode: string): Promise<Food | undefined> {
    return this.db.selectFrom('foods').selectAll().where('barcode', '=', barcode).executeTakeFirst();
  }

  async search(options: FoodSearchOptions): Promise<Food[]> {
    const { query, source, limit = 50, offset = 0 } = options;

    let queryBuilder = this.db.selectFrom('foods').selectAll();

    if (query && query.trim()) {
      // Use full-text search with tsvector
      queryBuilder = queryBuilder.where(
        sql<boolean>`to_tsvector('english', name) @@ plainto_tsquery('english', ${query})`,
      );
    }

    if (source) {
      queryBuilder = queryBuilder.where('source', '=', source);
    }

    return queryBuilder.orderBy('use_count', 'desc').limit(limit).offset(offset).execute();
  }

  async searchByName(query: string, limit = 50): Promise<Food[]> {
    if (!query.trim()) {
      return [];
    }

    // First try exact prefix match, then full-text search
    return this.db
      .selectFrom('foods')
      .selectAll()
      .where((eb) =>
        eb.or([
          eb(sql`lower(name)`, 'like', `${query.toLowerCase()}%`),
          eb(sql`to_tsvector('english', name) @@ plainto_tsquery('english', ${query})`, '=', true),
        ]),
      )
      .orderBy('use_count', 'desc')
      .limit(limit)
      .execute();
  }

  async findPopular(limit = 20): Promise<Food[]> {
    return this.db.selectFrom('foods').selectAll().orderBy('use_count', 'desc').limit(limit).execute();
  }

  async findUserCreated(userId: string, limit = 50): Promise<Food[]> {
    return this.db
      .selectFrom('foods')
      .selectAll()
      .where('created_by_user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
  }

  async create(data: NewFood): Promise<Food> {
    return this.db.insertInto('foods').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async createMany(foods: NewFood[]): Promise<number> {
    if (foods.length === 0) {
      return 0;
    }

    const result = await this.db.insertInto('foods').values(foods).execute();
    return Number(result.length);
  }

  async update(id: string, data: FoodUpdate): Promise<Food | undefined> {
    return this.db
      .updateTable('foods')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async incrementUseCount(id: string): Promise<void> {
    await this.db
      .updateTable('foods')
      .set({
        use_count: sql`use_count + 1`,
        updated_at: sql`now()`,
      })
      .where('id', '=', id)
      .execute();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('foods').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async countBySource(source: FoodSource): Promise<number> {
    const result = await this.db
      .selectFrom('foods')
      .select(sql<number>`count(*)`.as('count'))
      .where('source', '=', source)
      .executeTakeFirst();
    return Number(result?.count ?? 0);
  }

  async deleteBySource(source: FoodSource): Promise<number> {
    const result = await this.db.deleteFrom('foods').where('source', '=', source).executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
