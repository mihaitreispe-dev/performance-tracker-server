import { Injectable, Logger } from '@nestjs/common';
import { MealType, NewDailyNutritionSummary } from 'src/database/interfaces';
import { AthleteProfileMetricsRepository } from 'src/repositories/athlete-profile-metrics.repository';
import { DailyNutritionSummaryRepository } from 'src/repositories/daily-nutrition-summary.repository';
import { FoodLogEntryRepository, FoodLogEntryWithFood } from 'src/repositories/food-log-entry.repository';
import { UserNutritionGoalsRepository } from 'src/repositories/user-nutrition-goals.repository';

import { CalculatedGoals, FoodLogEntryWithNutrition, GoalProgress, MealBreakdown, NutritionTotals } from '../types';

@Injectable()
export class NutritionSummaryService {
  private readonly logger = new Logger(NutritionSummaryService.name);

  constructor(
    private readonly foodLogEntryRepository: FoodLogEntryRepository,
    private readonly dailySummaryRepository: DailyNutritionSummaryRepository,
    private readonly goalsRepository: UserNutritionGoalsRepository,
    private readonly profileMetricsRepository: AthleteProfileMetricsRepository,
  ) {}

  /**
   * Calculate nutrition totals for a single food log entry
   */
  calculateEntryNutrition(entry: FoodLogEntryWithFood): NutritionTotals {
    // Quick add entry - use quick add values
    if (entry.is_quick_add) {
      return {
        calories: Number(entry.quick_add_calories) || 0,
        protein: Number(entry.quick_add_protein) || 0,
        carbs: Number(entry.quick_add_carbs) || 0,
        fat: Number(entry.quick_add_fat) || 0,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        potassium: 0,
        calcium: 0,
        iron: 0,
        vitamin_a: 0,
        vitamin_c: 0,
        vitamin_d: 0,
        vitamin_b12: 0,
      };
    }

    // Food-based entry
    if (!entry.food) {
      return this.emptyTotals();
    }

    const quantity = Number(entry.quantity) || 1;
    const multiplier = Number(entry.serving_multiplier) || 1;
    const factor = quantity * multiplier;

    const food = entry.food;
    const servingRatio = (Number(food.serving_size_grams) || 100) / 100;

    return {
      calories: (Number(food.calories) || 0) * factor * servingRatio,
      protein: (Number(food.protein_g) || 0) * factor * servingRatio,
      carbs: (Number(food.carbs_g) || 0) * factor * servingRatio,
      fat: (Number(food.fat_g) || 0) * factor * servingRatio,
      fiber: (Number(food.fiber_g) || 0) * factor * servingRatio,
      sugar: (Number(food.sugar_g) || 0) * factor * servingRatio,
      sodium: (Number(food.sodium_mg) || 0) * factor * servingRatio,
      potassium: (Number(food.potassium_mg) || 0) * factor * servingRatio,
      calcium: (Number(food.calcium_mg) || 0) * factor * servingRatio,
      iron: (Number(food.iron_mg) || 0) * factor * servingRatio,
      vitamin_a: (Number(food.vitamin_a_mcg) || 0) * factor * servingRatio,
      vitamin_c: (Number(food.vitamin_c_mg) || 0) * factor * servingRatio,
      vitamin_d: (Number(food.vitamin_d_mcg) || 0) * factor * servingRatio,
      vitamin_b12: (Number(food.vitamin_b12_mcg) || 0) * factor * servingRatio,
    };
  }

  /**
   * Get meal breakdown for a specific date
   */
  async getMealBreakdown(userId: string, date: string): Promise<MealBreakdown[]> {
    const entries = await this.foodLogEntryRepository.findByUserAndDate({ userId, date });

    const mealTypes: MealType[] = [
      MealType.BREAKFAST,
      MealType.LUNCH,
      MealType.DINNER,
      MealType.SNACK,
      MealType.WORKOUT,
    ];

    return mealTypes.map((mealType) => {
      const mealEntries = entries.filter((e) => e.meal_type === mealType);
      const entriesWithNutrition: FoodLogEntryWithNutrition[] = mealEntries.map((entry) => ({
        ...entry,
        calculated_nutrition: this.calculateEntryNutrition(entry),
      }));

      const totals = this.sumTotals(entriesWithNutrition.map((e) => e.calculated_nutrition!));

      return {
        meal_type: mealType,
        entries: entriesWithNutrition,
        totals,
      };
    });
  }

  /**
   * Recalculate and update daily summary for a date
   */
  async recalculateDailySummary(userId: string, date: string): Promise<void> {
    const entries = await this.foodLogEntryRepository.findByUserAndDate({ userId, date });

    if (entries.length === 0) {
      // Delete summary if no entries
      await this.dailySummaryRepository.deleteByUserAndDate(userId, date);
      return;
    }

    const totals = this.emptyTotals();
    const mealCalories = { breakfast: 0, lunch: 0, dinner: 0, snack: 0, workout: 0 };
    const mealsWithEntries = new Set<string>();

    for (const entry of entries) {
      const nutrition = this.calculateEntryNutrition(entry);
      this.addToTotals(totals, nutrition);

      const mealType = entry.meal_type as MealType;
      mealsWithEntries.add(mealType);

      switch (mealType) {
        case MealType.BREAKFAST:
          mealCalories.breakfast += nutrition.calories;
          break;
        case MealType.LUNCH:
          mealCalories.lunch += nutrition.calories;
          break;
        case MealType.DINNER:
          mealCalories.dinner += nutrition.calories;
          break;
        case MealType.SNACK:
          mealCalories.snack += nutrition.calories;
          break;
        case MealType.WORKOUT:
          mealCalories.workout += nutrition.calories;
          break;
      }
    }

    const summaryData: NewDailyNutritionSummary = {
      user_id: userId,
      date: date,
      total_calories: totals.calories,
      total_protein: totals.protein,
      total_carbs: totals.carbs,
      total_fat: totals.fat,
      total_fiber: totals.fiber,
      total_sugar: totals.sugar,
      total_sodium: totals.sodium,
      total_potassium: totals.potassium,
      total_calcium: totals.calcium,
      total_iron: totals.iron,
      total_vitamin_a: totals.vitamin_a,
      total_vitamin_c: totals.vitamin_c,
      total_vitamin_d: totals.vitamin_d,
      total_vitamin_b12: totals.vitamin_b12,
      breakfast_calories: mealCalories.breakfast,
      lunch_calories: mealCalories.lunch,
      dinner_calories: mealCalories.dinner,
      snack_calories: mealCalories.snack,
      workout_calories: mealCalories.workout,
      meal_count: mealsWithEntries.size,
      entry_count: entries.length,
    };

    await this.dailySummaryRepository.upsert(summaryData);
  }

  /**
   * Calculate goals for a user (either from explicit goals or weight-based)
   */
  async calculateGoals(userId: string): Promise<CalculatedGoals | null> {
    const goals = await this.goalsRepository.findByUserId(userId);

    if (!goals) {
      return null;
    }

    // If auto-calculate is enabled, use weight-based calculation
    if (goals.auto_calculate_from_weight) {
      const profile = await this.profileMetricsRepository.findByUserId(userId);
      const weight = Number(profile?.weight_kg) || 70;

      const caloriesPerKg = Number(goals.calories_per_kg) || 35;
      const proteinPerKg = Number(goals.protein_g_per_kg) || 1.6;

      const dailyCalories = weight * caloriesPerKg;
      const proteinG = weight * proteinPerKg;

      // Default macro split: 30% protein, 40% carbs, 30% fat (if protein is fixed)
      const proteinCalories = proteinG * 4;
      const remainingCalories = dailyCalories - proteinCalories;
      const carbsG = (remainingCalories * 0.55) / 4; // 55% of remaining as carbs
      const fatG = (remainingCalories * 0.45) / 9; // 45% of remaining as fat

      return {
        daily_calories: Math.round(dailyCalories),
        protein_g: Math.round(proteinG),
        carbs_g: Math.round(carbsG),
        fat_g: Math.round(fatG),
        fiber_g: 30, // Default fiber goal
      };
    }

    // Use explicit goals
    const dailyCalories = Number(goals.daily_calories) || 2000;

    // Calculate from percentages if provided
    if (goals.protein_percent && goals.carbs_percent && goals.fat_percent) {
      return {
        daily_calories: dailyCalories,
        protein_g: Math.round((dailyCalories * (Number(goals.protein_percent) / 100)) / 4),
        carbs_g: Math.round((dailyCalories * (Number(goals.carbs_percent) / 100)) / 4),
        fat_g: Math.round((dailyCalories * (Number(goals.fat_percent) / 100)) / 9),
        fiber_g: Number(goals.fiber_g) || 30,
      };
    }

    // Use explicit gram values
    return {
      daily_calories: dailyCalories,
      protein_g: Number(goals.protein_g) || 150,
      carbs_g: Number(goals.carbs_g) || 250,
      fat_g: Number(goals.fat_g) || 65,
      fiber_g: Number(goals.fiber_g) || 30,
    };
  }

  /**
   * Get goal progress for a date
   */
  async getGoalProgress(userId: string, date: string): Promise<GoalProgress | null> {
    const goals = await this.calculateGoals(userId);
    if (!goals) {
      return null;
    }

    const summary = await this.dailySummaryRepository.findByUserAndDate(userId, date);
    const current = {
      calories: Number(summary?.total_calories) || 0,
      protein: Number(summary?.total_protein) || 0,
      carbs: Number(summary?.total_carbs) || 0,
      fat: Number(summary?.total_fat) || 0,
      fiber: Number(summary?.total_fiber) || 0,
    };

    return {
      calories: {
        current: current.calories,
        goal: goals.daily_calories,
        percentage: Math.min(100, Math.round((current.calories / goals.daily_calories) * 100)),
      },
      protein: {
        current: current.protein,
        goal: goals.protein_g,
        percentage: Math.min(100, Math.round((current.protein / goals.protein_g) * 100)),
      },
      carbs: {
        current: current.carbs,
        goal: goals.carbs_g,
        percentage: Math.min(100, Math.round((current.carbs / goals.carbs_g) * 100)),
      },
      fat: {
        current: current.fat,
        goal: goals.fat_g,
        percentage: Math.min(100, Math.round((current.fat / goals.fat_g) * 100)),
      },
      fiber: goals.fiber_g
        ? {
            current: current.fiber,
            goal: goals.fiber_g,
            percentage: Math.min(100, Math.round((current.fiber / goals.fiber_g) * 100)),
          }
        : undefined,
    };
  }

  private emptyTotals(): NutritionTotals {
    return {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0,
      potassium: 0,
      calcium: 0,
      iron: 0,
      vitamin_a: 0,
      vitamin_c: 0,
      vitamin_d: 0,
      vitamin_b12: 0,
    };
  }

  private addToTotals(totals: NutritionTotals, addition: NutritionTotals): void {
    totals.calories += addition.calories;
    totals.protein += addition.protein;
    totals.carbs += addition.carbs;
    totals.fat += addition.fat;
    totals.fiber += addition.fiber;
    totals.sugar += addition.sugar;
    totals.sodium += addition.sodium;
    totals.potassium += addition.potassium;
    totals.calcium += addition.calcium;
    totals.iron += addition.iron;
    totals.vitamin_a += addition.vitamin_a;
    totals.vitamin_c += addition.vitamin_c;
    totals.vitamin_d += addition.vitamin_d;
    totals.vitamin_b12 += addition.vitamin_b12;
  }

  private sumTotals(items: NutritionTotals[]): NutritionTotals {
    const totals = this.emptyTotals();
    for (const item of items) {
      this.addToTotals(totals, item);
    }
    return totals;
  }
}
