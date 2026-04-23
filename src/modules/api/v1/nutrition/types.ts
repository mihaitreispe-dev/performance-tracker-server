import { DailyNutritionSummary, Food, FoodLogEntry } from 'src/database/interfaces';

export interface NutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  potassium: number;
  calcium: number;
  iron: number;
  vitamin_a: number;
  vitamin_c: number;
  vitamin_d: number;
  vitamin_b12: number;
}

export interface MealBreakdown {
  meal_type: string;
  entries: FoodLogEntryWithNutrition[];
  totals: NutritionTotals;
}

export interface FoodLogEntryWithNutrition extends FoodLogEntry {
  food?: Food;
  calculated_nutrition?: NutritionTotals;
}

export interface WeeklySummary {
  start_date: string;
  end_date: string;
  days_logged: number;
  averages: NutritionTotals;
  daily_summaries: DailyNutritionSummary[];
}

export interface MonthlySummary {
  year: number;
  month: number;
  days_logged: number;
  averages: NutritionTotals;
  daily_data: Array<{
    date: string;
    total_calories: number;
    total_protein: number;
    total_carbs: number;
    total_fat: number;
  }>;
}

export interface CalculatedGoals {
  daily_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export interface GoalProgress {
  calories: { current: number; goal: number; percentage: number };
  protein: { current: number; goal: number; percentage: number };
  carbs: { current: number; goal: number; percentage: number };
  fat: { current: number; goal: number; percentage: number };
  fiber?: { current: number; goal: number; percentage: number };
}

export interface USDAFood {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients: USDANutrient[];
}

export interface USDANutrient {
  nutrientId: number;
  nutrientName: string;
  unitName: string;
  value: number;
}

export interface OpenFoodFactsProduct {
  code: string;
  product_name: string;
  brands?: string;
  serving_size?: string;
  nutriments: {
    'energy_kcal_100g'?: number;
    'proteins_100g'?: number;
    'carbohydrates_100g'?: number;
    'fat_100g'?: number;
    'fiber_100g'?: number;
    'sugars_100g'?: number;
    'sodium_100g'?: number;
    'potassium_100g'?: number;
    'calcium_100g'?: number;
    'iron_100g'?: number;
    'vitamin-a_100g'?: number;
    'vitamin-c_100g'?: number;
    'vitamin-d_100g'?: number;
    'vitamin-b12_100g'?: number;
    'saturated-fat_100g'?: number;
    'trans-fat_100g'?: number;
    'cholesterol_100g'?: number;
  };
}
