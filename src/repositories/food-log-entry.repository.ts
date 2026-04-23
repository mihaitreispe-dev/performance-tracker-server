import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, Food, FoodLogEntry, FoodLogEntryUpdate, MealType, NewFoodLogEntry } from 'src/database/interfaces';

export interface FoodLogEntryWithFood extends FoodLogEntry {
  food?: Food;
}

export interface FindByUserAndDateOptions {
  userId: string;
  date: Date | string;
  mealType?: MealType;
}

@Injectable()
export class FoodLogEntryRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<FoodLogEntry | undefined> {
    return this.db.selectFrom('food_log_entries').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findByIdWithFood(id: string): Promise<FoodLogEntryWithFood | undefined> {
    const result = await this.db
      .selectFrom('food_log_entries')
      .leftJoin('foods', 'food_log_entries.food_id', 'foods.id')
      .select([
        'food_log_entries.id',
        'food_log_entries.user_id',
        'food_log_entries.food_id',
        'food_log_entries.log_date',
        'food_log_entries.meal_type',
        'food_log_entries.quantity',
        'food_log_entries.serving_multiplier',
        'food_log_entries.is_quick_add',
        'food_log_entries.quick_add_calories',
        'food_log_entries.quick_add_protein',
        'food_log_entries.quick_add_carbs',
        'food_log_entries.quick_add_fat',
        'food_log_entries.quick_add_description',
        'food_log_entries.notes',
        'food_log_entries.created_at',
        'food_log_entries.updated_at',
        'foods.id as food_id_joined',
        'foods.name as food_name',
        'foods.brand as food_brand',
        'foods.calories as food_calories',
        'foods.protein_g as food_protein_g',
        'foods.carbs_g as food_carbs_g',
        'foods.fat_g as food_fat_g',
        'foods.fiber_g as food_fiber_g',
        'foods.sugar_g as food_sugar_g',
        'foods.serving_size_grams as food_serving_size_grams',
        'foods.serving_size_description as food_serving_size_description',
      ])
      .where('food_log_entries.id', '=', id)
      .executeTakeFirst();

    if (!result) {
      return undefined;
    }

    return this.mapToFoodLogEntryWithFood(result);
  }

  async findByUserAndDate(options: FindByUserAndDateOptions): Promise<FoodLogEntryWithFood[]> {
    const { userId, date, mealType } = options;

    let query = this.db
      .selectFrom('food_log_entries')
      .leftJoin('foods', 'food_log_entries.food_id', 'foods.id')
      .select([
        'food_log_entries.id',
        'food_log_entries.user_id',
        'food_log_entries.food_id',
        'food_log_entries.log_date',
        'food_log_entries.meal_type',
        'food_log_entries.quantity',
        'food_log_entries.serving_multiplier',
        'food_log_entries.is_quick_add',
        'food_log_entries.quick_add_calories',
        'food_log_entries.quick_add_protein',
        'food_log_entries.quick_add_carbs',
        'food_log_entries.quick_add_fat',
        'food_log_entries.quick_add_description',
        'food_log_entries.notes',
        'food_log_entries.created_at',
        'food_log_entries.updated_at',
        'foods.id as food_id_joined',
        'foods.name as food_name',
        'foods.brand as food_brand',
        'foods.calories as food_calories',
        'foods.protein_g as food_protein_g',
        'foods.carbs_g as food_carbs_g',
        'foods.fat_g as food_fat_g',
        'foods.fiber_g as food_fiber_g',
        'foods.sugar_g as food_sugar_g',
        'foods.sodium_mg as food_sodium_mg',
        'foods.potassium_mg as food_potassium_mg',
        'foods.calcium_mg as food_calcium_mg',
        'foods.iron_mg as food_iron_mg',
        'foods.vitamin_a_mcg as food_vitamin_a_mcg',
        'foods.vitamin_c_mg as food_vitamin_c_mg',
        'foods.vitamin_d_mcg as food_vitamin_d_mcg',
        'foods.vitamin_b12_mcg as food_vitamin_b12_mcg',
        'foods.serving_size_grams as food_serving_size_grams',
        'foods.serving_size_description as food_serving_size_description',
      ])
      .where('food_log_entries.user_id', '=', userId)
      .where(
        'food_log_entries.log_date',
        '=',
        sql<Date>`${date instanceof Date ? date.toISOString().split('T')[0] : date}::date`,
      );

    if (mealType) {
      query = query.where('food_log_entries.meal_type', '=', mealType);
    }

    const results = await query.orderBy('food_log_entries.created_at', 'asc').execute();

    return results.map((row) => this.mapToFoodLogEntryWithFood(row));
  }

  async findByUserAndDateRange(
    userId: string,
    startDate: Date | string,
    endDate: Date | string,
  ): Promise<FoodLogEntry[]> {
    const start = startDate instanceof Date ? startDate.toISOString().split('T')[0] : startDate;
    const end = endDate instanceof Date ? endDate.toISOString().split('T')[0] : endDate;

    return this.db
      .selectFrom('food_log_entries')
      .selectAll()
      .where('user_id', '=', userId)
      .where('log_date', '>=', sql<Date>`${start}::date`)
      .where('log_date', '<=', sql<Date>`${end}::date`)
      .orderBy('log_date', 'asc')
      .orderBy('created_at', 'asc')
      .execute();
  }

  async create(data: NewFoodLogEntry): Promise<FoodLogEntry> {
    return this.db.insertInto('food_log_entries').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async update(id: string, data: FoodLogEntryUpdate): Promise<FoodLogEntry | undefined> {
    return this.db
      .updateTable('food_log_entries')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('food_log_entries').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async deleteByUserAndDate(userId: string, date: Date | string): Promise<number> {
    const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;
    const result = await this.db
      .deleteFrom('food_log_entries')
      .where('user_id', '=', userId)
      .where('log_date', '=', sql<Date>`${dateStr}::date`)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  private mapToFoodLogEntryWithFood(row: Record<string, unknown>): FoodLogEntryWithFood {
    const entry: FoodLogEntryWithFood = {
      id: row.id as string,
      user_id: row.user_id as string,
      food_id: row.food_id as string | null,
      log_date: row.log_date as Date,
      meal_type: row.meal_type as string,
      quantity: row.quantity as string,
      serving_multiplier: row.serving_multiplier as string,
      is_quick_add: row.is_quick_add as boolean,
      quick_add_calories: row.quick_add_calories as string | null,
      quick_add_protein: row.quick_add_protein as string | null,
      quick_add_carbs: row.quick_add_carbs as string | null,
      quick_add_fat: row.quick_add_fat as string | null,
      quick_add_description: row.quick_add_description as string | null,
      notes: row.notes as string | null,
      created_at: row.created_at as Date,
      updated_at: row.updated_at as Date,
    };

    if (row.food_id_joined) {
      entry.food = {
        id: row.food_id_joined as string,
        name: row.food_name as string,
        brand: row.food_brand as string | null,
        calories: row.food_calories as string | null,
        protein_g: row.food_protein_g as string | null,
        carbs_g: row.food_carbs_g as string | null,
        fat_g: row.food_fat_g as string | null,
        fiber_g: row.food_fiber_g as string | null,
        sugar_g: row.food_sugar_g as string | null,
        sodium_mg: row.food_sodium_mg as string | null,
        potassium_mg: row.food_potassium_mg as string | null,
        calcium_mg: row.food_calcium_mg as string | null,
        iron_mg: row.food_iron_mg as string | null,
        vitamin_a_mcg: row.food_vitamin_a_mcg as string | null,
        vitamin_c_mg: row.food_vitamin_c_mg as string | null,
        vitamin_d_mcg: row.food_vitamin_d_mcg as string | null,
        vitamin_b12_mcg: row.food_vitamin_b12_mcg as string | null,
        serving_size_grams: row.food_serving_size_grams as string | null,
        serving_size_description: row.food_serving_size_description as string | null,
      } as Food;
    }

    return entry;
  }
}
