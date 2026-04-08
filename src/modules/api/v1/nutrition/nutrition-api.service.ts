import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { FoodRepository } from 'src/repositories/food.repository';
import { FoodLogEntryRepository, FoodLogEntryWithFood } from 'src/repositories/food-log-entry.repository';
import { DailyNutritionSummaryRepository } from 'src/repositories/daily-nutrition-summary.repository';
import { UserNutritionGoalsRepository } from 'src/repositories/user-nutrition-goals.repository';
import { UserFrequentFoodRepository } from 'src/repositories/user-frequent-food.repository';
import { FoodSource, Food } from 'src/database/interfaces';
import { FoodDatabaseService } from './services/food-database.service';
import { NutritionSummaryService } from './services/nutrition-summary.service';
import {
  FoodSearchQuery,
  CreateCustomFoodBody,
  FoodLogQuery,
  CreateFoodLogBody,
  UpdateFoodLogBody,
  WeeklySummaryQuery,
  MonthlySummaryQuery,
  UpdateNutritionGoalsBody,
} from './request.dto';
import {
  FoodDTO,
  FoodListResponseDTO,
  FoodLogEntryDTO,
  DailyNutritionSummaryDTO,
  DailyMealsResponseDTO,
  WeeklySummaryDTO,
  MonthlySummaryDTO,
  NutritionGoalsDTO,
  FrequentFoodsResponseDTO,
  NutritionTotalsDTO,
  MealBreakdownDTO,
} from './response.dto';
import { MealBreakdown, NutritionTotals, FoodLogEntryWithNutrition } from './types';

@Injectable()
export class NutritionApiService {
  private readonly logger = new Logger(NutritionApiService.name);

  constructor(
    private readonly foodRepository: FoodRepository,
    private readonly foodLogEntryRepository: FoodLogEntryRepository,
    private readonly dailySummaryRepository: DailyNutritionSummaryRepository,
    private readonly goalsRepository: UserNutritionGoalsRepository,
    private readonly frequentFoodRepository: UserFrequentFoodRepository,
    private readonly foodDatabaseService: FoodDatabaseService,
    private readonly nutritionSummaryService: NutritionSummaryService,
  ) {}

  // ==========================================================================
  // Food Search
  // ==========================================================================

  async searchFoods(req: Request & { user: AuthUser }, query: FoodSearchQuery): Promise<{ data: FoodListResponseDTO }> {
    const foods = await this.foodDatabaseService.search(query.query, {
      source: query.source as FoodSource,
      limit: query.limit,
    });

    return {
      data: {
        foods: foods.map((f) => this.toFoodDTO(f)),
        total: foods.length,
      },
    };
  }

  async getFoodByBarcode(req: Request & { user: AuthUser }, barcode: string): Promise<{ data: FoodDTO | null }> {
    const food = await this.foodDatabaseService.getByBarcode(barcode);
    return { data: food ? this.toFoodDTO(food) : null };
  }

  async getFood(req: Request & { user: AuthUser }, foodId: string): Promise<{ data: FoodDTO }> {
    const food = await this.foodRepository.findById(foodId);
    if (!food) {
      throw new NotFoundException('Food not found');
    }
    return { data: this.toFoodDTO(food) };
  }

  async createCustomFood(req: Request & { user: AuthUser }, body: CreateCustomFoodBody): Promise<{ data: FoodDTO }> {
    const userId = req.user.id;

    const food = await this.foodRepository.create({
      source: FoodSource.USER_CREATED,
      created_by_user_id: userId,
      name: body.name,
      brand: body.brand,
      barcode: body.barcode,
      serving_size_grams: body.serving_size_grams || 100,
      serving_size_description: body.serving_size_description,
      calories: body.calories,
      protein_g: body.protein_g,
      carbs_g: body.carbs_g,
      fat_g: body.fat_g,
      fiber_g: body.fiber_g,
      sugar_g: body.sugar_g,
      sodium_mg: body.sodium_mg,
      potassium_mg: body.potassium_mg,
      saturated_fat_g: body.saturated_fat_g,
      cholesterol_mg: body.cholesterol_mg,
    });

    return { data: this.toFoodDTO(food) };
  }

  async getFrequentFoods(req: Request & { user: AuthUser }): Promise<{ data: FrequentFoodsResponseDTO }> {
    const userId = req.user.id;

    const [frequent, favorites] = await Promise.all([
      this.frequentFoodRepository.findFrequentByUser(userId, 20),
      this.frequentFoodRepository.findFavoritesByUser(userId),
    ]);

    return {
      data: {
        frequent: frequent.map((f) => ({
          id: f.id,
          user_id: f.user_id,
          food_id: f.food_id,
          use_count: f.use_count,
          last_used_at: f.last_used_at.toISOString(),
          is_favorite: f.is_favorite,
          food: this.toFoodDTO(f.food),
        })),
        favorites: favorites.map((f) => ({
          id: f.id,
          user_id: f.user_id,
          food_id: f.food_id,
          use_count: f.use_count,
          last_used_at: f.last_used_at.toISOString(),
          is_favorite: f.is_favorite,
          food: this.toFoodDTO(f.food),
        })),
      },
    };
  }

  async setFavorite(req: Request & { user: AuthUser }, foodId: string, isFavorite: boolean): Promise<void> {
    const userId = req.user.id;

    // Verify food exists
    const food = await this.foodRepository.findById(foodId);
    if (!food) {
      throw new NotFoundException('Food not found');
    }

    await this.frequentFoodRepository.setFavorite(userId, foodId, isFavorite);
  }

  // ==========================================================================
  // Food Logs
  // ==========================================================================

  async listFoodLogs(req: Request & { user: AuthUser }, query: FoodLogQuery): Promise<{ data: FoodLogEntryDTO[] }> {
    const userId = req.user.id;

    const entries = await this.foodLogEntryRepository.findByUserAndDate({
      userId,
      date: query.date,
      mealType: query.meal_type,
    });

    return {
      data: entries.map((entry) => {
        const nutrition = this.nutritionSummaryService.calculateEntryNutrition(entry);
        return this.toFoodLogEntryDTO(entry, nutrition);
      }),
    };
  }

  async getFoodLog(req: Request & { user: AuthUser }, logId: string): Promise<{ data: FoodLogEntryDTO }> {
    const entry = await this.foodLogEntryRepository.findByIdWithFood(logId);

    if (!entry || entry.user_id !== req.user.id) {
      throw new NotFoundException('Food log entry not found');
    }

    const nutrition = this.nutritionSummaryService.calculateEntryNutrition(entry);
    return { data: this.toFoodLogEntryDTO(entry, nutrition) };
  }

  async createFoodLog(req: Request & { user: AuthUser }, body: CreateFoodLogBody): Promise<{ data: FoodLogEntryDTO }> {
    const userId = req.user.id;

    // Validate food_id if not quick add
    if (!body.is_quick_add && body.food_id) {
      const food = await this.foodRepository.findById(body.food_id);
      if (!food) {
        throw new BadRequestException('Food not found');
      }
    }

    // Validate quick add
    if (body.is_quick_add && !body.quick_add_calories) {
      throw new BadRequestException('Quick add entries require calories');
    }

    const entry = await this.foodLogEntryRepository.create({
      user_id: userId,
      food_id: body.food_id,
      log_date: body.log_date,
      meal_type: body.meal_type,
      quantity: body.quantity || 1,
      serving_multiplier: body.serving_multiplier || 1,
      is_quick_add: body.is_quick_add || false,
      quick_add_calories: body.quick_add_calories,
      quick_add_protein: body.quick_add_protein,
      quick_add_carbs: body.quick_add_carbs,
      quick_add_fat: body.quick_add_fat,
      quick_add_description: body.quick_add_description,
      notes: body.notes,
    });

    // Track frequent food usage
    if (body.food_id) {
      await this.frequentFoodRepository.incrementUsage(userId, body.food_id);
      await this.foodRepository.incrementUseCount(body.food_id);
    }

    // Recalculate daily summary
    await this.nutritionSummaryService.recalculateDailySummary(userId, body.log_date);

    const entryWithFood = await this.foodLogEntryRepository.findByIdWithFood(entry.id);
    const nutrition = this.nutritionSummaryService.calculateEntryNutrition(entryWithFood!);
    return { data: this.toFoodLogEntryDTO(entryWithFood!, nutrition) };
  }

  async updateFoodLog(
    req: Request & { user: AuthUser },
    logId: string,
    body: UpdateFoodLogBody,
  ): Promise<{ data: FoodLogEntryDTO }> {
    const existing = await this.foodLogEntryRepository.findById(logId);

    if (!existing || existing.user_id !== req.user.id) {
      throw new NotFoundException('Food log entry not found');
    }

    const updated = await this.foodLogEntryRepository.update(logId, body);

    // Recalculate daily summary
    const logDate =
      existing.log_date instanceof Date ? existing.log_date.toISOString().split('T')[0] : existing.log_date;
    await this.nutritionSummaryService.recalculateDailySummary(req.user.id, logDate);

    const entryWithFood = await this.foodLogEntryRepository.findByIdWithFood(updated!.id);
    const nutrition = this.nutritionSummaryService.calculateEntryNutrition(entryWithFood!);
    return { data: this.toFoodLogEntryDTO(entryWithFood!, nutrition) };
  }

  async deleteFoodLog(req: Request & { user: AuthUser }, logId: string): Promise<void> {
    const existing = await this.foodLogEntryRepository.findById(logId);

    if (!existing || existing.user_id !== req.user.id) {
      throw new NotFoundException('Food log entry not found');
    }

    await this.foodLogEntryRepository.delete(logId);

    // Recalculate daily summary
    const logDate =
      existing.log_date instanceof Date ? existing.log_date.toISOString().split('T')[0] : existing.log_date;
    await this.nutritionSummaryService.recalculateDailySummary(req.user.id, logDate);
  }

  // ==========================================================================
  // Summaries
  // ==========================================================================

  async getDailySummary(req: Request & { user: AuthUser }, date?: string): Promise<{ data: DailyNutritionSummaryDTO | null }> {
    const userId = req.user.id;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const summary = await this.dailySummaryRepository.findByUserAndDate(userId, targetDate);
    return { data: summary ? this.toDailySummaryDTO(summary) : null };
  }

  async getDailyMeals(req: Request & { user: AuthUser }, date: string): Promise<{ data: DailyMealsResponseDTO }> {
    const userId = req.user.id;

    const [mealBreakdown, goalProgress] = await Promise.all([
      this.nutritionSummaryService.getMealBreakdown(userId, date),
      this.nutritionSummaryService.getGoalProgress(userId, date),
    ]);

    // Calculate totals
    const totals = mealBreakdown.reduce(
      (acc, meal) => {
        acc.calories += meal.totals.calories;
        acc.protein += meal.totals.protein;
        acc.carbs += meal.totals.carbs;
        acc.fat += meal.totals.fat;
        acc.fiber += meal.totals.fiber;
        acc.sugar += meal.totals.sugar;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 },
    );

    return {
      data: {
        date,
        meals: mealBreakdown.map((m) => this.toMealBreakdownDTO(m)),
        totals: totals as NutritionTotalsDTO,
        goal_progress: goalProgress
          ? {
              calories: goalProgress.calories,
              protein: goalProgress.protein,
              carbs: goalProgress.carbs,
              fat: goalProgress.fat,
              fiber: goalProgress.fiber,
            }
          : undefined,
      },
    };
  }

  async getWeeklySummary(req: Request & { user: AuthUser }, query: WeeklySummaryQuery): Promise<{ data: WeeklySummaryDTO }> {
    const userId = req.user.id;
    const endDate = query.date ? new Date(query.date) : new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);

    const summaries = await this.dailySummaryRepository.findByUserAndDateRange(
      userId,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0],
    );

    const averages = await this.dailySummaryRepository.getWeeklyAverage(userId, endDate);

    return {
      data: {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        days_logged: averages.total_days,
        averages: {
          calories: averages.avg_calories,
          protein: averages.avg_protein,
          carbs: averages.avg_carbs,
          fat: averages.avg_fat,
          fiber: averages.avg_fiber,
          sugar: 0,
        },
        daily_summaries: summaries.map((s) => this.toDailySummaryDTO(s)),
      },
    };
  }

  async getMonthlySummary(req: Request & { user: AuthUser }, query: MonthlySummaryQuery): Promise<{ data: MonthlySummaryDTO }> {
    const userId = req.user.id;

    const trend = await this.dailySummaryRepository.getMonthlyTrend(userId, query.year, query.month);

    // Calculate averages
    const totals = trend.reduce(
      (acc, day) => {
        acc.calories += day.total_calories;
        acc.protein += day.total_protein;
        acc.carbs += day.total_carbs;
        acc.fat += day.total_fat;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );

    const daysLogged = trend.length;

    return {
      data: {
        year: query.year,
        month: query.month,
        days_logged: daysLogged,
        averages: {
          calories: daysLogged > 0 ? totals.calories / daysLogged : 0,
          protein: daysLogged > 0 ? totals.protein / daysLogged : 0,
          carbs: daysLogged > 0 ? totals.carbs / daysLogged : 0,
          fat: daysLogged > 0 ? totals.fat / daysLogged : 0,
          fiber: 0,
          sugar: 0,
        },
        daily_data: trend,
      },
    };
  }

  // ==========================================================================
  // Goals
  // ==========================================================================

  async getNutritionGoals(req: Request & { user: AuthUser }): Promise<{ data: NutritionGoalsDTO | null }> {
    const userId = req.user.id;

    const goals = await this.goalsRepository.findByUserId(userId);
    if (!goals) {
      return { data: null };
    }

    const calculatedGoals = await this.nutritionSummaryService.calculateGoals(userId);

    return {
      data: {
        id: goals.id,
        user_id: goals.user_id,
        daily_calories: goals.daily_calories ? Number(goals.daily_calories) : undefined,
        protein_g: goals.protein_g ? Number(goals.protein_g) : undefined,
        carbs_g: goals.carbs_g ? Number(goals.carbs_g) : undefined,
        fat_g: goals.fat_g ? Number(goals.fat_g) : undefined,
        fiber_g: goals.fiber_g ? Number(goals.fiber_g) : undefined,
        protein_percent: goals.protein_percent ? Number(goals.protein_percent) : undefined,
        carbs_percent: goals.carbs_percent ? Number(goals.carbs_percent) : undefined,
        fat_percent: goals.fat_percent ? Number(goals.fat_percent) : undefined,
        auto_calculate_from_weight: goals.auto_calculate_from_weight,
        calories_per_kg: goals.calories_per_kg ? Number(goals.calories_per_kg) : undefined,
        protein_g_per_kg: goals.protein_g_per_kg ? Number(goals.protein_g_per_kg) : undefined,
        calculated_goals: calculatedGoals || undefined,
        created_at: goals.created_at.toISOString(),
        updated_at: goals.updated_at.toISOString(),
      },
    };
  }

  async updateNutritionGoals(
    req: Request & { user: AuthUser },
    body: UpdateNutritionGoalsBody,
  ): Promise<{ data: NutritionGoalsDTO }> {
    const userId = req.user.id;

    const goals = await this.goalsRepository.upsert({
      user_id: userId,
      daily_calories: body.daily_calories,
      protein_g: body.protein_g,
      carbs_g: body.carbs_g,
      fat_g: body.fat_g,
      fiber_g: body.fiber_g,
      protein_percent: body.protein_percent,
      carbs_percent: body.carbs_percent,
      fat_percent: body.fat_percent,
      auto_calculate_from_weight: body.auto_calculate_from_weight,
      calories_per_kg: body.calories_per_kg,
      protein_g_per_kg: body.protein_g_per_kg,
    });

    const calculatedGoals = await this.nutritionSummaryService.calculateGoals(userId);

    return {
      data: {
        id: goals.id,
        user_id: goals.user_id,
        daily_calories: goals.daily_calories ? Number(goals.daily_calories) : undefined,
        protein_g: goals.protein_g ? Number(goals.protein_g) : undefined,
        carbs_g: goals.carbs_g ? Number(goals.carbs_g) : undefined,
        fat_g: goals.fat_g ? Number(goals.fat_g) : undefined,
        fiber_g: goals.fiber_g ? Number(goals.fiber_g) : undefined,
        protein_percent: goals.protein_percent ? Number(goals.protein_percent) : undefined,
        carbs_percent: goals.carbs_percent ? Number(goals.carbs_percent) : undefined,
        fat_percent: goals.fat_percent ? Number(goals.fat_percent) : undefined,
        auto_calculate_from_weight: goals.auto_calculate_from_weight,
        calories_per_kg: goals.calories_per_kg ? Number(goals.calories_per_kg) : undefined,
        protein_g_per_kg: goals.protein_g_per_kg ? Number(goals.protein_g_per_kg) : undefined,
        calculated_goals: calculatedGoals || undefined,
        created_at: goals.created_at.toISOString(),
        updated_at: goals.updated_at.toISOString(),
      },
    };
  }

  // ==========================================================================
  // DTOs
  // ==========================================================================

  private toFoodDTO(food: Food): FoodDTO {
    return {
      id: food.id,
      external_id: food.external_id || undefined,
      source: food.source,
      barcode: food.barcode || undefined,
      name: food.name,
      brand: food.brand || undefined,
      serving_size_grams: Number(food.serving_size_grams) || 100,
      serving_size_description: food.serving_size_description || undefined,
      calories: food.calories ? Number(food.calories) : undefined,
      protein_g: food.protein_g ? Number(food.protein_g) : undefined,
      carbs_g: food.carbs_g ? Number(food.carbs_g) : undefined,
      fat_g: food.fat_g ? Number(food.fat_g) : undefined,
      fiber_g: food.fiber_g ? Number(food.fiber_g) : undefined,
      sugar_g: food.sugar_g ? Number(food.sugar_g) : undefined,
      sodium_mg: food.sodium_mg ? Number(food.sodium_mg) : undefined,
      potassium_mg: food.potassium_mg ? Number(food.potassium_mg) : undefined,
      calcium_mg: food.calcium_mg ? Number(food.calcium_mg) : undefined,
      iron_mg: food.iron_mg ? Number(food.iron_mg) : undefined,
      vitamin_a_mcg: food.vitamin_a_mcg ? Number(food.vitamin_a_mcg) : undefined,
      vitamin_c_mg: food.vitamin_c_mg ? Number(food.vitamin_c_mg) : undefined,
      vitamin_d_mcg: food.vitamin_d_mcg ? Number(food.vitamin_d_mcg) : undefined,
      vitamin_b12_mcg: food.vitamin_b12_mcg ? Number(food.vitamin_b12_mcg) : undefined,
      saturated_fat_g: food.saturated_fat_g ? Number(food.saturated_fat_g) : undefined,
      trans_fat_g: food.trans_fat_g ? Number(food.trans_fat_g) : undefined,
      cholesterol_mg: food.cholesterol_mg ? Number(food.cholesterol_mg) : undefined,
      use_count: food.use_count,
      created_at: food.created_at.toISOString(),
      updated_at: food.updated_at.toISOString(),
    };
  }

  private toFoodLogEntryDTO(entry: (FoodLogEntryWithFood | FoodLogEntryWithNutrition) & { calculated_nutrition?: NutritionTotals }, nutrition?: NutritionTotals): FoodLogEntryDTO {
    const logDate = entry.log_date instanceof Date ? entry.log_date.toISOString().split('T')[0] : String(entry.log_date);

    return {
      id: entry.id,
      user_id: entry.user_id,
      food_id: entry.food_id || undefined,
      log_date: logDate,
      meal_type: entry.meal_type,
      quantity: Number(entry.quantity),
      serving_multiplier: Number(entry.serving_multiplier),
      is_quick_add: entry.is_quick_add,
      quick_add_calories: entry.quick_add_calories ? Number(entry.quick_add_calories) : undefined,
      quick_add_protein: entry.quick_add_protein ? Number(entry.quick_add_protein) : undefined,
      quick_add_carbs: entry.quick_add_carbs ? Number(entry.quick_add_carbs) : undefined,
      quick_add_fat: entry.quick_add_fat ? Number(entry.quick_add_fat) : undefined,
      quick_add_description: entry.quick_add_description || undefined,
      notes: entry.notes || undefined,
      food: entry.food ? this.toFoodDTO(entry.food) : undefined,
      calculated_nutrition: nutrition || entry.calculated_nutrition,
      created_at: entry.created_at.toISOString(),
      updated_at: entry.updated_at.toISOString(),
    };
  }

  private toDailySummaryDTO(summary: Record<string, unknown>): DailyNutritionSummaryDTO {
    const date = summary.date instanceof Date ? summary.date.toISOString().split('T')[0] : String(summary.date);

    return {
      id: summary.id as string,
      user_id: summary.user_id as string,
      date,
      total_calories: Number(summary.total_calories),
      total_protein: Number(summary.total_protein),
      total_carbs: Number(summary.total_carbs),
      total_fat: Number(summary.total_fat),
      total_fiber: Number(summary.total_fiber),
      total_sugar: Number(summary.total_sugar),
      total_sodium: Number(summary.total_sodium) || undefined,
      total_potassium: Number(summary.total_potassium) || undefined,
      total_calcium: Number(summary.total_calcium) || undefined,
      total_iron: Number(summary.total_iron) || undefined,
      total_vitamin_a: Number(summary.total_vitamin_a) || undefined,
      total_vitamin_c: Number(summary.total_vitamin_c) || undefined,
      total_vitamin_d: Number(summary.total_vitamin_d) || undefined,
      total_vitamin_b12: Number(summary.total_vitamin_b12) || undefined,
      breakfast_calories: Number(summary.breakfast_calories),
      lunch_calories: Number(summary.lunch_calories),
      dinner_calories: Number(summary.dinner_calories),
      snack_calories: Number(summary.snack_calories),
      workout_calories: Number(summary.workout_calories),
      meal_count: summary.meal_count as number,
      entry_count: summary.entry_count as number,
      created_at: (summary.created_at as Date).toISOString(),
      updated_at: (summary.updated_at as Date).toISOString(),
    };
  }

  private toMealBreakdownDTO(meal: MealBreakdown): MealBreakdownDTO {
    return {
      meal_type: meal.meal_type,
      entries: meal.entries.map((e) => this.toFoodLogEntryDTO(e, e.calculated_nutrition)),
      totals: meal.totals as NutritionTotalsDTO,
    };
  }
}
