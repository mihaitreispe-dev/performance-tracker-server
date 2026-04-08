import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export interface UserNutritionGoalsTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;
  // Absolute targets (grams)
  daily_calories: ColumnType<string | null, string | number | null, string | number | null>;
  protein_g: ColumnType<string | null, string | number | null, string | number | null>;
  carbs_g: ColumnType<string | null, string | number | null, string | number | null>;
  fat_g: ColumnType<string | null, string | number | null, string | number | null>;
  fiber_g: ColumnType<string | null, string | number | null, string | number | null>;
  // Percentage targets (alternative to absolute)
  protein_percent: ColumnType<string | null, string | number | null, string | number | null>;
  carbs_percent: ColumnType<string | null, string | number | null, string | number | null>;
  fat_percent: ColumnType<string | null, string | number | null, string | number | null>;
  // Weight-based auto-calculation
  auto_calculate_from_weight: ColumnType<boolean, boolean | undefined, boolean>;
  calories_per_kg: ColumnType<string | null, string | number | null, string | number | null>;
  protein_g_per_kg: ColumnType<string | null, string | number | null, string | number | null>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type UserNutritionGoals = Selectable<UserNutritionGoalsTable>;
export type NewUserNutritionGoals = Insertable<UserNutritionGoalsTable>;
export type UserNutritionGoalsUpdate = Updateable<UserNutritionGoalsTable>;
