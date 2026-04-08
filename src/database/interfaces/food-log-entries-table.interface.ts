import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

// Meal type enum
export const MealType = {
  BREAKFAST: 'breakfast',
  LUNCH: 'lunch',
  DINNER: 'dinner',
  SNACK: 'snack',
  WORKOUT: 'workout',
} as const;
export type MealType = (typeof MealType)[keyof typeof MealType];

export interface FoodLogEntriesTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;
  food_id: ColumnType<string | null, string | null, string | null>;
  log_date: ColumnType<Date, Date | string, Date | string>;
  meal_type: string;
  quantity: ColumnType<string, string | number, string | number>;
  serving_multiplier: ColumnType<string, string | number, string | number>;
  // Quick add fields
  is_quick_add: ColumnType<boolean, boolean | undefined, boolean>;
  quick_add_calories: ColumnType<string | null, string | number | null, string | number | null>;
  quick_add_protein: ColumnType<string | null, string | number | null, string | number | null>;
  quick_add_carbs: ColumnType<string | null, string | number | null, string | number | null>;
  quick_add_fat: ColumnType<string | null, string | number | null, string | number | null>;
  quick_add_description: ColumnType<string | null, string | null, string | null>;
  notes: ColumnType<string | null, string | null, string | null>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type FoodLogEntry = Selectable<FoodLogEntriesTable>;
export type NewFoodLogEntry = Insertable<FoodLogEntriesTable>;
export type FoodLogEntryUpdate = Updateable<FoodLogEntriesTable>;
