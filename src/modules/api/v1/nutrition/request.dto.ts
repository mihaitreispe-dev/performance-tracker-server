import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

// ==========================================================================
// Food Search
// ==========================================================================

export class FoodSearchQuery {
  @ApiProperty({ description: 'Search query' })
  @IsString()
  @MaxLength(200)
  query: string;

  @ApiPropertyOptional({ enum: ['usda', 'open_food_facts', 'user_created'], description: 'Filter by source' })
  @IsString()
  @IsOptional()
  @IsIn(['usda', 'open_food_facts', 'user_created'])
  source?: 'usda' | 'open_food_facts' | 'user_created';

  @ApiPropertyOptional({ description: 'Number of results to return', default: 50 })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset for pagination', default: 0 })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  offset?: number;
}

export class BarcodeQuery {
  @ApiProperty({ description: 'Product barcode (EAN/UPC)' })
  @IsString()
  @MaxLength(50)
  barcode: string;
}

// ==========================================================================
// Custom Food Creation
// ==========================================================================

export class CreateCustomFoodBody {
  @ApiProperty({ description: 'Food name' })
  @IsString()
  @MaxLength(500)
  name: string;

  @ApiPropertyOptional({ description: 'Brand name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  brand?: string;

  @ApiPropertyOptional({ description: 'Barcode (EAN/UPC)' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  barcode?: string;

  @ApiPropertyOptional({ description: 'Serving size in grams', default: 100 })
  @IsNumber()
  @IsOptional()
  @Min(0.1)
  serving_size_grams?: number;

  @ApiPropertyOptional({ description: 'Serving size description (e.g., "1 cup", "1 medium")' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  serving_size_description?: string;

  @ApiProperty({ description: 'Calories per serving' })
  @IsNumber()
  @Min(0)
  calories: number;

  @ApiPropertyOptional({ description: 'Protein in grams' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  protein_g?: number;

  @ApiPropertyOptional({ description: 'Carbohydrates in grams' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  carbs_g?: number;

  @ApiPropertyOptional({ description: 'Fat in grams' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  fat_g?: number;

  @ApiPropertyOptional({ description: 'Fiber in grams' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  fiber_g?: number;

  @ApiPropertyOptional({ description: 'Sugar in grams' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  sugar_g?: number;

  @ApiPropertyOptional({ description: 'Sodium in mg' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  sodium_mg?: number;

  @ApiPropertyOptional({ description: 'Potassium in mg' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  potassium_mg?: number;

  @ApiPropertyOptional({ description: 'Saturated fat in grams' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  saturated_fat_g?: number;

  @ApiPropertyOptional({ description: 'Cholesterol in mg' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  cholesterol_mg?: number;
}

// ==========================================================================
// Food Logs
// ==========================================================================

export class FoodLogQuery {
  @ApiProperty({ description: 'Date in YYYY-MM-DD format' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({
    enum: ['breakfast', 'lunch', 'dinner', 'snack', 'workout'],
    description: 'Filter by meal type',
  })
  @IsString()
  @IsOptional()
  @IsIn(['breakfast', 'lunch', 'dinner', 'snack', 'workout'])
  meal_type?: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'workout';
}

export class CreateFoodLogBody {
  @ApiProperty({ description: 'Date in YYYY-MM-DD format' })
  @IsDateString()
  log_date: string;

  @ApiProperty({ enum: ['breakfast', 'lunch', 'dinner', 'snack', 'workout'], description: 'Meal type' })
  @IsString()
  @IsIn(['breakfast', 'lunch', 'dinner', 'snack', 'workout'])
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'workout';

  @ApiPropertyOptional({ description: 'Food ID (required if not quick add)' })
  @IsUUID()
  @IsOptional()
  @ValidateIf((o) => !o.is_quick_add)
  food_id?: string;

  @ApiPropertyOptional({ description: 'Number of servings', default: 1 })
  @IsNumber()
  @IsOptional()
  @Min(0.1)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Serving size multiplier', default: 1 })
  @IsNumber()
  @IsOptional()
  @Min(0.1)
  serving_multiplier?: number;

  @ApiPropertyOptional({ description: 'Is this a quick add entry (no food selection)', default: false })
  @IsBoolean()
  @IsOptional()
  is_quick_add?: boolean;

  @ApiPropertyOptional({ description: 'Quick add calories (required if quick add)' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @ValidateIf((o) => o.is_quick_add)
  quick_add_calories?: number;

  @ApiPropertyOptional({ description: 'Quick add protein' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  quick_add_protein?: number;

  @ApiPropertyOptional({ description: 'Quick add carbs' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  quick_add_carbs?: number;

  @ApiPropertyOptional({ description: 'Quick add fat' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  quick_add_fat?: number;

  @ApiPropertyOptional({ description: 'Quick add description' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  quick_add_description?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateFoodLogBody {
  @ApiPropertyOptional({ description: 'Number of servings' })
  @IsNumber()
  @IsOptional()
  @Min(0.1)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Serving size multiplier' })
  @IsNumber()
  @IsOptional()
  @Min(0.1)
  serving_multiplier?: number;

  @ApiPropertyOptional({ enum: ['breakfast', 'lunch', 'dinner', 'snack', 'workout'], description: 'Meal type' })
  @IsString()
  @IsOptional()
  @IsIn(['breakfast', 'lunch', 'dinner', 'snack', 'workout'])
  meal_type?: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'workout';

  @ApiPropertyOptional({ description: 'Quick add calories' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  quick_add_calories?: number;

  @ApiPropertyOptional({ description: 'Quick add protein' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  quick_add_protein?: number;

  @ApiPropertyOptional({ description: 'Quick add carbs' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  quick_add_carbs?: number;

  @ApiPropertyOptional({ description: 'Quick add fat' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  quick_add_fat?: number;

  @ApiPropertyOptional({ description: 'Quick add description' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  quick_add_description?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;
}

// ==========================================================================
// Summaries
// ==========================================================================

export class DailySummaryQuery {
  @ApiPropertyOptional({ description: 'Date in YYYY-MM-DD format (defaults to today)' })
  @IsDateString()
  @IsOptional()
  date?: string;
}

export class WeeklySummaryQuery {
  @ApiPropertyOptional({ description: 'End date of the week in YYYY-MM-DD format (defaults to today)' })
  @IsDateString()
  @IsOptional()
  date?: string;
}

export class MonthlySummaryQuery {
  @ApiProperty({ description: 'Year' })
  @Type(() => Number)
  @IsNumber()
  @Min(2000)
  @Max(2100)
  year: number;

  @ApiProperty({ description: 'Month (1-12)' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(12)
  month: number;
}

// ==========================================================================
// Goals
// ==========================================================================

export class UpdateNutritionGoalsBody {
  @ApiPropertyOptional({ description: 'Daily calorie target' })
  @IsNumber()
  @IsOptional()
  @Min(500)
  @Max(10000)
  daily_calories?: number;

  @ApiPropertyOptional({ description: 'Daily protein target in grams' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  protein_g?: number;

  @ApiPropertyOptional({ description: 'Daily carbs target in grams' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  carbs_g?: number;

  @ApiPropertyOptional({ description: 'Daily fat target in grams' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  fat_g?: number;

  @ApiPropertyOptional({ description: 'Daily fiber target in grams' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  fiber_g?: number;

  @ApiPropertyOptional({ description: 'Protein percentage of calories (alternative to grams)' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  protein_percent?: number;

  @ApiPropertyOptional({ description: 'Carbs percentage of calories (alternative to grams)' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  carbs_percent?: number;

  @ApiPropertyOptional({ description: 'Fat percentage of calories (alternative to grams)' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  fat_percent?: number;

  @ApiPropertyOptional({ description: 'Auto-calculate goals based on weight' })
  @IsBoolean()
  @IsOptional()
  auto_calculate_from_weight?: boolean;

  @ApiPropertyOptional({ description: 'Calories per kg body weight (for auto-calculation)' })
  @IsNumber()
  @IsOptional()
  @Min(20)
  @Max(60)
  calories_per_kg?: number;

  @ApiPropertyOptional({ description: 'Protein grams per kg body weight (for auto-calculation)' })
  @IsNumber()
  @IsOptional()
  @Min(0.5)
  @Max(4)
  protein_g_per_kg?: number;
}

// ==========================================================================
// Favorites
// ==========================================================================

export class SetFavoriteBody {
  @ApiProperty({ description: 'Set as favorite' })
  @IsBoolean()
  is_favorite: boolean;
}
