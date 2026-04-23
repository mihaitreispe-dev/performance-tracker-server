import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, Food, NewUserFrequentFood, UserFrequentFood, UserFrequentFoodUpdate } from 'src/database/interfaces';

export interface UserFrequentFoodWithFood extends UserFrequentFood {
  food: Food;
}

@Injectable()
export class UserFrequentFoodRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<UserFrequentFood | undefined> {
    return this.db.selectFrom('user_frequent_foods').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findByUserAndFood(userId: string, foodId: string): Promise<UserFrequentFood | undefined> {
    return this.db
      .selectFrom('user_frequent_foods')
      .selectAll()
      .where('user_id', '=', userId)
      .where('food_id', '=', foodId)
      .executeTakeFirst();
  }

  async findFrequentByUser(userId: string, limit = 20): Promise<UserFrequentFoodWithFood[]> {
    const results = await this.db
      .selectFrom('user_frequent_foods')
      .innerJoin('foods', 'user_frequent_foods.food_id', 'foods.id')
      .select([
        'user_frequent_foods.id',
        'user_frequent_foods.user_id',
        'user_frequent_foods.food_id',
        'user_frequent_foods.use_count',
        'user_frequent_foods.last_used_at',
        'user_frequent_foods.is_favorite',
        'user_frequent_foods.created_at',
        'user_frequent_foods.updated_at',
        'foods.id as f_id',
        'foods.external_id as f_external_id',
        'foods.source as f_source',
        'foods.barcode as f_barcode',
        'foods.name as f_name',
        'foods.brand as f_brand',
        'foods.serving_size_grams as f_serving_size_grams',
        'foods.serving_size_description as f_serving_size_description',
        'foods.calories as f_calories',
        'foods.protein_g as f_protein_g',
        'foods.carbs_g as f_carbs_g',
        'foods.fat_g as f_fat_g',
        'foods.fiber_g as f_fiber_g',
        'foods.sugar_g as f_sugar_g',
        'foods.use_count as f_use_count',
        'foods.created_at as f_created_at',
        'foods.updated_at as f_updated_at',
      ])
      .where('user_frequent_foods.user_id', '=', userId)
      .orderBy('user_frequent_foods.use_count', 'desc')
      .limit(limit)
      .execute();

    return results.map((r) => this.mapToUserFrequentFoodWithFood(r));
  }

  async findFavoritesByUser(userId: string): Promise<UserFrequentFoodWithFood[]> {
    const results = await this.db
      .selectFrom('user_frequent_foods')
      .innerJoin('foods', 'user_frequent_foods.food_id', 'foods.id')
      .select([
        'user_frequent_foods.id',
        'user_frequent_foods.user_id',
        'user_frequent_foods.food_id',
        'user_frequent_foods.use_count',
        'user_frequent_foods.last_used_at',
        'user_frequent_foods.is_favorite',
        'user_frequent_foods.created_at',
        'user_frequent_foods.updated_at',
        'foods.id as f_id',
        'foods.external_id as f_external_id',
        'foods.source as f_source',
        'foods.barcode as f_barcode',
        'foods.name as f_name',
        'foods.brand as f_brand',
        'foods.serving_size_grams as f_serving_size_grams',
        'foods.serving_size_description as f_serving_size_description',
        'foods.calories as f_calories',
        'foods.protein_g as f_protein_g',
        'foods.carbs_g as f_carbs_g',
        'foods.fat_g as f_fat_g',
        'foods.fiber_g as f_fiber_g',
        'foods.sugar_g as f_sugar_g',
        'foods.use_count as f_use_count',
        'foods.created_at as f_created_at',
        'foods.updated_at as f_updated_at',
      ])
      .where('user_frequent_foods.user_id', '=', userId)
      .where('user_frequent_foods.is_favorite', '=', true)
      .orderBy('user_frequent_foods.last_used_at', 'desc')
      .execute();

    return results.map((r) => this.mapToUserFrequentFoodWithFood(r));
  }

  async create(data: NewUserFrequentFood): Promise<UserFrequentFood> {
    return this.db.insertInto('user_frequent_foods').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async update(id: string, data: UserFrequentFoodUpdate): Promise<UserFrequentFood | undefined> {
    return this.db
      .updateTable('user_frequent_foods')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async incrementUsage(userId: string, foodId: string): Promise<UserFrequentFood> {
    // Try to update existing record
    const existing = await this.findByUserAndFood(userId, foodId);

    if (existing) {
      return this.db
        .updateTable('user_frequent_foods')
        .set({
          use_count: sql`use_count + 1`,
          last_used_at: sql`now()`,
          updated_at: sql`now()`,
        })
        .where('id', '=', existing.id)
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    // Create new record
    return this.create({
      user_id: userId,
      food_id: foodId,
      use_count: 1,
      last_used_at: new Date(),
    });
  }

  async setFavorite(userId: string, foodId: string, isFavorite: boolean): Promise<UserFrequentFood | undefined> {
    const existing = await this.findByUserAndFood(userId, foodId);

    if (existing) {
      return this.db
        .updateTable('user_frequent_foods')
        .set({
          is_favorite: isFavorite,
          updated_at: sql`now()`,
        })
        .where('id', '=', existing.id)
        .returningAll()
        .executeTakeFirst();
    }

    // Create new record if setting as favorite
    if (isFavorite) {
      return this.create({
        user_id: userId,
        food_id: foodId,
        is_favorite: true,
        use_count: 0,
        last_used_at: new Date(),
      });
    }

    return undefined;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('user_frequent_foods').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async deleteByUserAndFood(userId: string, foodId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('user_frequent_foods')
      .where('user_id', '=', userId)
      .where('food_id', '=', foodId)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  private mapToUserFrequentFoodWithFood(row: Record<string, unknown>): UserFrequentFoodWithFood {
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      food_id: row.food_id as string,
      use_count: row.use_count as number,
      last_used_at: row.last_used_at as Date,
      is_favorite: row.is_favorite as boolean,
      created_at: row.created_at as Date,
      updated_at: row.updated_at as Date,
      food: {
        id: row.f_id as string,
        external_id: row.f_external_id as string | null,
        source: row.f_source as string,
        barcode: row.f_barcode as string | null,
        name: row.f_name as string,
        brand: row.f_brand as string | null,
        serving_size_grams: row.f_serving_size_grams as string | null,
        serving_size_description: row.f_serving_size_description as string | null,
        calories: row.f_calories as string | null,
        protein_g: row.f_protein_g as string | null,
        carbs_g: row.f_carbs_g as string | null,
        fat_g: row.f_fat_g as string | null,
        fiber_g: row.f_fiber_g as string | null,
        sugar_g: row.f_sugar_g as string | null,
        use_count: row.f_use_count as number,
        created_at: row.f_created_at as Date,
        updated_at: row.f_updated_at as Date,
      } as Food,
    };
  }
}
