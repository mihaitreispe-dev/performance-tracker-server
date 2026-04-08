import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

// Food source enum
export const FoodSource = {
  USDA: 'usda',
  OPEN_FOOD_FACTS: 'open_food_facts',
  USER_CREATED: 'user_created',
} as const;
export type FoodSource = (typeof FoodSource)[keyof typeof FoodSource];

export interface FoodsTable {
  id: ColumnType<string, string | undefined, never>;
  external_id: ColumnType<string | null, string | null, string | null>;
  source: string;
  barcode: ColumnType<string | null, string | null, string | null>;
  name: string;
  brand: ColumnType<string | null, string | null, string | null>;
  serving_size_grams: ColumnType<string | null, string | number | null, string | number | null>;
  serving_size_description: ColumnType<string | null, string | null, string | null>;
  // Macros
  calories: ColumnType<string | null, string | number | null, string | number | null>;
  protein_g: ColumnType<string | null, string | number | null, string | number | null>;
  carbs_g: ColumnType<string | null, string | number | null, string | number | null>;
  fat_g: ColumnType<string | null, string | number | null, string | number | null>;
  fiber_g: ColumnType<string | null, string | number | null, string | number | null>;
  sugar_g: ColumnType<string | null, string | number | null, string | number | null>;
  // Minerals
  sodium_mg: ColumnType<string | null, string | number | null, string | number | null>;
  potassium_mg: ColumnType<string | null, string | number | null, string | number | null>;
  calcium_mg: ColumnType<string | null, string | number | null, string | number | null>;
  iron_mg: ColumnType<string | null, string | number | null, string | number | null>;
  // Vitamins
  vitamin_a_mcg: ColumnType<string | null, string | number | null, string | number | null>;
  vitamin_c_mg: ColumnType<string | null, string | number | null, string | number | null>;
  vitamin_d_mcg: ColumnType<string | null, string | number | null, string | number | null>;
  vitamin_b12_mcg: ColumnType<string | null, string | number | null, string | number | null>;
  // Fats breakdown
  saturated_fat_g: ColumnType<string | null, string | number | null, string | number | null>;
  trans_fat_g: ColumnType<string | null, string | number | null, string | number | null>;
  cholesterol_mg: ColumnType<string | null, string | number | null, string | number | null>;
  // Tracking
  created_by_user_id: ColumnType<string | null, string | null, string | null>;
  use_count: ColumnType<number, number | undefined, number>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type Food = Selectable<FoodsTable>;
export type NewFood = Insertable<FoodsTable>;
export type FoodUpdate = Updateable<FoodsTable>;
