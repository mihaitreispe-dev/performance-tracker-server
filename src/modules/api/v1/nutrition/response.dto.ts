import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ==========================================================================
// Food DTOs
// ==========================================================================

export class FoodDTO {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  external_id?: string;

  @ApiProperty({ enum: ['usda', 'open_food_facts', 'user_created'] })
  source: string;

  @ApiPropertyOptional()
  barcode?: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  brand?: string;

  @ApiProperty()
  serving_size_grams: number;

  @ApiPropertyOptional()
  serving_size_description?: string;

  @ApiPropertyOptional()
  calories?: number;

  @ApiPropertyOptional()
  protein_g?: number;

  @ApiPropertyOptional()
  carbs_g?: number;

  @ApiPropertyOptional()
  fat_g?: number;

  @ApiPropertyOptional()
  fiber_g?: number;

  @ApiPropertyOptional()
  sugar_g?: number;

  @ApiPropertyOptional()
  sodium_mg?: number;

  @ApiPropertyOptional()
  potassium_mg?: number;

  @ApiPropertyOptional()
  calcium_mg?: number;

  @ApiPropertyOptional()
  iron_mg?: number;

  @ApiPropertyOptional()
  vitamin_a_mcg?: number;

  @ApiPropertyOptional()
  vitamin_c_mg?: number;

  @ApiPropertyOptional()
  vitamin_d_mcg?: number;

  @ApiPropertyOptional()
  vitamin_b12_mcg?: number;

  @ApiPropertyOptional()
  saturated_fat_g?: number;

  @ApiPropertyOptional()
  trans_fat_g?: number;

  @ApiPropertyOptional()
  cholesterol_mg?: number;

  @ApiProperty()
  use_count: number;

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  updated_at: string;
}

export class FoodListResponseDTO {
  @ApiProperty({ type: [FoodDTO] })
  foods: FoodDTO[];

  @ApiProperty()
  total: number;
}

// ==========================================================================
// Food Log DTOs
// ==========================================================================

export class NutritionTotalsDTO {
  @ApiProperty()
  calories: number;

  @ApiProperty()
  protein: number;

  @ApiProperty()
  carbs: number;

  @ApiProperty()
  fat: number;

  @ApiProperty()
  fiber: number;

  @ApiProperty()
  sugar: number;

  @ApiPropertyOptional()
  sodium?: number;

  @ApiPropertyOptional()
  potassium?: number;

  @ApiPropertyOptional()
  calcium?: number;

  @ApiPropertyOptional()
  iron?: number;

  @ApiPropertyOptional()
  vitamin_a?: number;

  @ApiPropertyOptional()
  vitamin_c?: number;

  @ApiPropertyOptional()
  vitamin_d?: number;

  @ApiPropertyOptional()
  vitamin_b12?: number;
}

export class FoodLogEntryDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  user_id: string;

  @ApiPropertyOptional()
  food_id?: string;

  @ApiProperty()
  log_date: string;

  @ApiProperty({ enum: ['breakfast', 'lunch', 'dinner', 'snack', 'workout'] })
  meal_type: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  serving_multiplier: number;

  @ApiProperty()
  is_quick_add: boolean;

  @ApiPropertyOptional()
  quick_add_calories?: number;

  @ApiPropertyOptional()
  quick_add_protein?: number;

  @ApiPropertyOptional()
  quick_add_carbs?: number;

  @ApiPropertyOptional()
  quick_add_fat?: number;

  @ApiPropertyOptional()
  quick_add_description?: string;

  @ApiPropertyOptional()
  notes?: string;

  @ApiPropertyOptional({ type: FoodDTO })
  food?: FoodDTO;

  @ApiPropertyOptional({ type: NutritionTotalsDTO })
  calculated_nutrition?: NutritionTotalsDTO;

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  updated_at: string;
}

export class MealBreakdownDTO {
  @ApiProperty({ enum: ['breakfast', 'lunch', 'dinner', 'snack', 'workout'] })
  meal_type: string;

  @ApiProperty({ type: [FoodLogEntryDTO] })
  entries: FoodLogEntryDTO[];

  @ApiProperty({ type: NutritionTotalsDTO })
  totals: NutritionTotalsDTO;
}

// ==========================================================================
// Summary DTOs
// ==========================================================================

export class DailyNutritionSummaryDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  user_id: string;

  @ApiProperty()
  date: string;

  @ApiProperty()
  total_calories: number;

  @ApiProperty()
  total_protein: number;

  @ApiProperty()
  total_carbs: number;

  @ApiProperty()
  total_fat: number;

  @ApiProperty()
  total_fiber: number;

  @ApiProperty()
  total_sugar: number;

  @ApiPropertyOptional()
  total_sodium?: number;

  @ApiPropertyOptional()
  total_potassium?: number;

  @ApiPropertyOptional()
  total_calcium?: number;

  @ApiPropertyOptional()
  total_iron?: number;

  @ApiPropertyOptional()
  total_vitamin_a?: number;

  @ApiPropertyOptional()
  total_vitamin_c?: number;

  @ApiPropertyOptional()
  total_vitamin_d?: number;

  @ApiPropertyOptional()
  total_vitamin_b12?: number;

  @ApiProperty()
  breakfast_calories: number;

  @ApiProperty()
  lunch_calories: number;

  @ApiProperty()
  dinner_calories: number;

  @ApiProperty()
  snack_calories: number;

  @ApiProperty()
  workout_calories: number;

  @ApiProperty()
  meal_count: number;

  @ApiProperty()
  entry_count: number;

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  updated_at: string;
}

export class GoalProgressItemDTO {
  @ApiProperty()
  current: number;

  @ApiProperty()
  goal: number;

  @ApiProperty()
  percentage: number;
}

export class GoalProgressDTO {
  @ApiProperty({ type: GoalProgressItemDTO })
  calories: GoalProgressItemDTO;

  @ApiProperty({ type: GoalProgressItemDTO })
  protein: GoalProgressItemDTO;

  @ApiProperty({ type: GoalProgressItemDTO })
  carbs: GoalProgressItemDTO;

  @ApiProperty({ type: GoalProgressItemDTO })
  fat: GoalProgressItemDTO;

  @ApiPropertyOptional({ type: GoalProgressItemDTO })
  fiber?: GoalProgressItemDTO;
}

export class DailyMealsResponseDTO {
  @ApiProperty()
  date: string;

  @ApiProperty({ type: [MealBreakdownDTO] })
  meals: MealBreakdownDTO[];

  @ApiProperty({ type: NutritionTotalsDTO })
  totals: NutritionTotalsDTO;

  @ApiPropertyOptional({ type: GoalProgressDTO })
  goal_progress?: GoalProgressDTO;
}

export class WeeklySummaryDTO {
  @ApiProperty()
  start_date: string;

  @ApiProperty()
  end_date: string;

  @ApiProperty()
  days_logged: number;

  @ApiProperty({ type: NutritionTotalsDTO })
  averages: NutritionTotalsDTO;

  @ApiProperty({ type: [DailyNutritionSummaryDTO] })
  daily_summaries: DailyNutritionSummaryDTO[];
}

export class MonthlySummaryDTO {
  @ApiProperty()
  year: number;

  @ApiProperty()
  month: number;

  @ApiProperty()
  days_logged: number;

  @ApiProperty({ type: NutritionTotalsDTO })
  averages: NutritionTotalsDTO;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        total_calories: { type: 'number' },
        total_protein: { type: 'number' },
        total_carbs: { type: 'number' },
        total_fat: { type: 'number' },
      },
    },
  })
  daily_data: Array<{
    date: string;
    total_calories: number;
    total_protein: number;
    total_carbs: number;
    total_fat: number;
  }>;
}

// ==========================================================================
// Nutrition Goals DTO
// ==========================================================================

export class CalculatedGoalsDTO {
  @ApiProperty()
  daily_calories: number;

  @ApiProperty()
  protein_g: number;

  @ApiProperty()
  carbs_g: number;

  @ApiProperty()
  fat_g: number;

  @ApiProperty()
  fiber_g: number;
}

export class NutritionGoalsDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  user_id: string;

  @ApiPropertyOptional()
  daily_calories?: number;

  @ApiPropertyOptional()
  protein_g?: number;

  @ApiPropertyOptional()
  carbs_g?: number;

  @ApiPropertyOptional()
  fat_g?: number;

  @ApiPropertyOptional()
  fiber_g?: number;

  @ApiPropertyOptional()
  protein_percent?: number;

  @ApiPropertyOptional()
  carbs_percent?: number;

  @ApiPropertyOptional()
  fat_percent?: number;

  @ApiProperty()
  auto_calculate_from_weight: boolean;

  @ApiPropertyOptional()
  calories_per_kg?: number;

  @ApiPropertyOptional()
  protein_g_per_kg?: number;

  @ApiPropertyOptional({ description: 'Calculated goals based on current settings and weight' })
  calculated_goals?: CalculatedGoalsDTO;

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  updated_at: string;
}

// ==========================================================================
// Frequent Foods DTOs
// ==========================================================================

export class FrequentFoodDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  user_id: string;

  @ApiProperty()
  food_id: string;

  @ApiProperty()
  use_count: number;

  @ApiProperty()
  last_used_at: string;

  @ApiProperty()
  is_favorite: boolean;

  @ApiProperty({ type: FoodDTO })
  food: FoodDTO;
}

export class FrequentFoodsResponseDTO {
  @ApiProperty({ type: [FrequentFoodDTO] })
  frequent: FrequentFoodDTO[];

  @ApiProperty({ type: [FrequentFoodDTO] })
  favorites: FrequentFoodDTO[];
}
