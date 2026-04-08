import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export interface DailyNutritionSummariesTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;
  date: ColumnType<Date, Date | string, Date | string>;
  // Total macros
  total_calories: ColumnType<string, string | number, string | number>;
  total_protein: ColumnType<string, string | number, string | number>;
  total_carbs: ColumnType<string, string | number, string | number>;
  total_fat: ColumnType<string, string | number, string | number>;
  total_fiber: ColumnType<string, string | number, string | number>;
  total_sugar: ColumnType<string, string | number, string | number>;
  // Total minerals
  total_sodium: ColumnType<string, string | number, string | number>;
  total_potassium: ColumnType<string, string | number, string | number>;
  total_calcium: ColumnType<string, string | number, string | number>;
  total_iron: ColumnType<string, string | number, string | number>;
  // Total vitamins
  total_vitamin_a: ColumnType<string, string | number, string | number>;
  total_vitamin_c: ColumnType<string, string | number, string | number>;
  total_vitamin_d: ColumnType<string, string | number, string | number>;
  total_vitamin_b12: ColumnType<string, string | number, string | number>;
  // Per-meal breakdowns
  breakfast_calories: ColumnType<string, string | number, string | number>;
  lunch_calories: ColumnType<string, string | number, string | number>;
  dinner_calories: ColumnType<string, string | number, string | number>;
  snack_calories: ColumnType<string, string | number, string | number>;
  workout_calories: ColumnType<string, string | number, string | number>;
  // Counts
  meal_count: ColumnType<number, number, number>;
  entry_count: ColumnType<number, number, number>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type DailyNutritionSummary = Selectable<DailyNutritionSummariesTable>;
export type NewDailyNutritionSummary = Insertable<DailyNutritionSummariesTable>;
export type DailyNutritionSummaryUpdate = Updateable<DailyNutritionSummariesTable>;
