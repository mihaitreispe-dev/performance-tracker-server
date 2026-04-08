import { Injectable, Logger } from '@nestjs/common';
import {
  CaffeineStrategy,
  ElectrolyteStrategy,
  EnergyManagementPlan,
  IntensityPhase,
  NutritionProductType,
  NutritionTiming,
  ProductRecommendation,
  SweatRateBasis,
} from 'src/database/interfaces';
import { CaffeineTolerance, GiSensitivity, CarbSource } from 'src/database/interfaces/athlete-profile-metrics-table.interface';

export interface NutritionPreferences {
  sweatRateMlPerHour?: number | null;
  giSensitivity?: GiSensitivity;
  preferredCarbSources?: CarbSource[];
  caffeineTolerance?: CaffeineTolerance;
}

interface DurationBasedTargets {
  carbsPerHour: number;
  sodiumPerHour: number;
  primaryProducts: NutritionProductType[];
}

@Injectable()
export class NutritionPlanService {
  private readonly logger = new Logger(NutritionPlanService.name);

  /**
   * Generate a personalized nutrition plan based on athlete metrics and race parameters
   */
  generateNutritionPlan(
    distanceMeters: number,
    estimatedTimeSeconds: number,
    athleteWeightKg: number,
    temperature: number,
    humidity: number,
    hydrationMultiplier: number,
    preferences?: NutritionPreferences,
  ): EnergyManagementPlan {
    const distanceKm = distanceMeters / 1000;
    const durationHours = estimatedTimeSeconds / 3600;

    this.logger.debug(
      `Generating nutrition plan: ${distanceKm.toFixed(1)}km, ${durationHours.toFixed(2)}h, ${athleteWeightKg}kg`,
    );

    // 1. Calculate duration-based targets
    const targets = this.calculateDurationBasedTargets(durationHours);

    // 2. Estimate sweat rate (use measured if available)
    const sweatRateMlPerHour =
      preferences?.sweatRateMlPerHour ?? this.estimateSweatRate(athleteWeightKg, temperature, humidity);
    const sweatRateBasis: SweatRateBasis = preferences?.sweatRateMlPerHour ? 'measured' : 'estimated';

    // 3. Calculate hydration needs (apply weather multiplier)
    const hydrationMlPerHour = Math.round(sweatRateMlPerHour * hydrationMultiplier);

    // 4. Calculate electrolyte strategy
    const electrolyteStrategy = this.calculateSodiumNeeds(sweatRateMlPerHour, durationHours, sweatRateBasis);

    // 5. Determine carb loading and race morning nutrition
    const carbLoadingDays = this.calculateCarbLoadingDays(distanceKm, durationHours);
    const raceMorningCarbs = this.calculateRaceMorningCarbs(distanceKm, durationHours);

    // 6. Generate on-course nutrition timeline with GI pacing
    const giSensitivity = preferences?.giSensitivity || 'moderate';
    const onCourseNutrition = this.generateOnCourseNutrition(
      estimatedTimeSeconds,
      distanceKm,
      durationHours,
      targets.carbsPerHour,
      hydrationMlPerHour,
      electrolyteStrategy.per_hour_sodium_mg,
      giSensitivity,
      preferences?.preferredCarbSources,
    );

    // 7. Generate product recommendations
    const productRecommendations = this.generateProductRecommendations(
      durationHours,
      preferences?.preferredCarbSources,
    );

    // 8. Generate GI pacing notes for high sensitivity
    const giPacingNotes = this.generateGiPacingNotes(giSensitivity, durationHours);

    // 9. Generate caffeine strategy
    const caffeineStrategy = this.generateCaffeineStrategy(
      distanceKm,
      durationHours,
      estimatedTimeSeconds,
      preferences?.caffeineTolerance,
    );

    return {
      carb_loading_days_before: carbLoadingDays,
      race_morning_carbs_grams: raceMorningCarbs,
      race_morning_timing_hours_before: 3,
      on_course_nutrition: onCourseNutrition,
      total_carbs_per_hour: durationHours > 1 ? targets.carbsPerHour : 0,
      total_hydration_ml_per_hour: durationHours > 1 ? hydrationMlPerHour : 0,
      total_sodium_mg_per_hour: durationHours > 1 ? electrolyteStrategy.per_hour_sodium_mg : 0,
      electrolyte_strategy: electrolyteStrategy,
      product_recommendations: productRecommendations,
      gi_pacing_notes: giPacingNotes,
      caffeine_strategy: caffeineStrategy,
    };
  }

  /**
   * Duration-based carb and sodium targets
   * Research: Jeukendrup 2014, ACSM position stand
   */
  private calculateDurationBasedTargets(durationHours: number): DurationBasedTargets {
    if (durationHours < 1) {
      return {
        carbsPerHour: 0,
        sodiumPerHour: 200,
        primaryProducts: ['water_only'],
      };
    } else if (durationHours < 1.5) {
      return {
        carbsPerHour: 30,
        sodiumPerHour: 300,
        primaryProducts: ['sports_drink'],
      };
    } else if (durationHours < 2.5) {
      return {
        carbsPerHour: 50,
        sodiumPerHour: 450,
        primaryProducts: ['gel', 'sports_drink'],
      };
    } else if (durationHours < 3) {
      return {
        carbsPerHour: 70,
        sodiumPerHour: 550,
        primaryProducts: ['gel', 'sports_drink'],
      };
    } else {
      // Ultra-endurance: higher carb targets with dual-transport carbs
      return {
        carbsPerHour: 90,
        sodiumPerHour: 650,
        primaryProducts: ['real_food', 'gel', 'sports_drink'],
      };
    }
  }

  /**
   * Estimate sweat rate based on weight and environmental conditions
   * Formula: Base rate adjusted for weight, temperature, and humidity
   */
  private estimateSweatRate(weightKg: number, temperature: number, humidity: number): number {
    // Base sweat rate: 800ml/hour for a 70kg athlete
    // Adjust +/-10ml per kg from baseline
    const baseRate = 800 + (weightKg - 70) * 10;

    // Temperature multiplier: +2% per degree above 15C
    const tempMultiplier = 1 + Math.max(0, temperature - 15) * 0.02;

    // Humidity multiplier: +0.5% per % humidity above 50 (only if temp > 18C)
    const humidityMultiplier = temperature > 18 ? 1 + Math.max(0, humidity - 50) * 0.005 : 1;

    const estimatedSweatRate = baseRate * tempMultiplier * humidityMultiplier;

    // Clamp to reasonable range (400-2500 ml/hour)
    return Math.round(Math.max(400, Math.min(2500, estimatedSweatRate)));
  }

  /**
   * Calculate sodium needs based on sweat rate
   * Research: 900-1200mg sodium per liter of sweat (Shirreffs & Sawka 2011)
   */
  private calculateSodiumNeeds(
    sweatRateMlPerHour: number,
    durationHours: number,
    sweatRateBasis: SweatRateBasis,
  ): ElectrolyteStrategy {
    // Average sodium concentration in sweat: 1000mg/L (range 500-1800mg/L)
    const sodiumConcentration = 1000;

    // Per hour sodium needs
    const perHourSodiumMg = Math.round((sweatRateMlPerHour / 1000) * sodiumConcentration);

    // Pre-race sodium loading recommendation (for races > 2 hours)
    let preRaceSodiumMg = 0;
    if (durationHours >= 2) {
      // 500-1000mg sodium with pre-race meal
      preRaceSodiumMg = durationHours >= 3 ? 1000 : 500;
    }

    return {
      pre_race_sodium_mg: preRaceSodiumMg,
      per_hour_sodium_mg: perHourSodiumMg,
      sweat_rate_basis: sweatRateBasis,
    };
  }

  /**
   * Calculate carb loading days based on race duration and distance
   */
  private calculateCarbLoadingDays(distanceKm: number, durationHours: number): number {
    // Duration-based (more scientific than distance alone)
    if (durationHours >= 3 || distanceKm >= 42) {
      return 2;
    } else if (durationHours >= 1.5 || distanceKm >= 21) {
      return 1;
    }
    return 0;
  }

  /**
   * Calculate race morning carbohydrate intake
   */
  private calculateRaceMorningCarbs(distanceKm: number, durationHours: number): number {
    if (durationHours >= 3 || distanceKm >= 42) {
      return 100; // High glycogen demand
    } else if (durationHours >= 2 || distanceKm >= 21) {
      return 70;
    } else if (durationHours >= 1) {
      return 50;
    }
    return 30; // Short races
  }

  /**
   * Generate on-course nutrition timeline
   */
  private generateOnCourseNutrition(
    estimatedTimeSeconds: number,
    distanceKm: number,
    durationHours: number,
    carbsPerHour: number,
    hydrationMlPerHour: number,
    sodiumMgPerHour: number,
    giSensitivity: GiSensitivity,
    preferredCarbSources?: CarbSource[],
  ): NutritionTiming[] {
    const nutrition: NutritionTiming[] = [];

    // No on-course nutrition for races under 1 hour
    if (durationHours < 1) {
      return nutrition;
    }

    // Determine interval based on GI sensitivity
    let intervalMinutes = 30;
    if (giSensitivity === 'high') {
      intervalMinutes = 20; // More frequent, smaller doses
    } else if (giSensitivity === 'low') {
      intervalMinutes = 30; // Standard intervals
    }

    // Start time based on GI sensitivity
    let startTimeMinutes = 20;
    if (giSensitivity === 'high') {
      startTimeMinutes = 30; // Start later to avoid early GI distress
    }

    const estimatedMinutes = estimatedTimeSeconds / 60;
    let timeElapsed = startTimeMinutes;

    while (timeElapsed < estimatedMinutes - 10) {
      const distanceCovered = (timeElapsed / 60) * (distanceKm / durationHours);
      const progressPercent = (timeElapsed / estimatedMinutes) * 100;

      // Determine intensity phase
      const intensityPhase = this.determineIntensityPhase(progressPercent);

      // Calculate nutrition for this interval
      const carbsForInterval = Math.round((carbsPerHour * intervalMinutes) / 60);
      const hydrationForInterval = Math.round((hydrationMlPerHour * intervalMinutes) / 60);
      const sodiumForInterval = Math.round((sodiumMgPerHour * intervalMinutes) / 60);

      // Adjust carbs based on GI sensitivity and phase
      let adjustedCarbs = carbsForInterval;
      if (giSensitivity === 'high') {
        // Back-load carbs: less early, more later
        if (intensityPhase === 'early') {
          adjustedCarbs = Math.round(carbsForInterval * 0.7);
        } else if (intensityPhase === 'late') {
          adjustedCarbs = Math.round(carbsForInterval * 1.2);
        }
      }

      // Determine product type for this interval
      const productType = this.selectProductType(intensityPhase, durationHours, preferredCarbSources);

      // Generate notes
      const notes = this.generateTimingNotes(
        timeElapsed,
        intensityPhase,
        productType,
        timeElapsed === startTimeMinutes,
      );

      nutrition.push({
        time_elapsed_minutes: timeElapsed,
        distance_km: parseFloat(distanceCovered.toFixed(1)),
        carbs_grams: adjustedCarbs,
        hydration_ml: hydrationForInterval,
        sodium_mg: sodiumForInterval,
        product_type: productType,
        intensity_phase: intensityPhase,
        notes,
      });

      timeElapsed += intervalMinutes;
    }

    return nutrition;
  }

  /**
   * Determine race phase based on progress
   */
  private determineIntensityPhase(progressPercent: number): IntensityPhase {
    if (progressPercent < 33) {
      return 'early';
    } else if (progressPercent < 75) {
      return 'middle';
    }
    return 'late';
  }

  /**
   * Select product type based on phase and preferences
   */
  private selectProductType(
    phase: IntensityPhase,
    durationHours: number,
    preferredSources?: CarbSource[],
  ): NutritionProductType {
    // Short races: primarily drinks
    if (durationHours < 1.5) {
      return 'sports_drink';
    }

    // Check athlete preferences
    const hasPreference = preferredSources && preferredSources.length > 0;

    // Long races (3+ hours): real food early, gels later
    if (durationHours >= 3) {
      if (phase === 'early') {
        if (hasPreference && preferredSources!.includes('real_food')) {
          return 'real_food';
        }
        return 'real_food';
      } else if (phase === 'late') {
        if (hasPreference && preferredSources!.includes('gels')) {
          return 'gel';
        }
        return 'gel';
      }
    }

    // Medium duration: gels + drinks
    if (hasPreference) {
      if (preferredSources!.includes('gels')) return 'gel';
      if (preferredSources!.includes('chews')) return 'chews';
      if (preferredSources!.includes('drinks')) return 'sports_drink';
    }

    return phase === 'early' ? 'sports_drink' : 'gel';
  }

  /**
   * Generate context-specific notes for nutrition timing
   */
  private generateTimingNotes(
    timeMinutes: number,
    phase: IntensityPhase,
    productType: NutritionProductType,
    isFirst: boolean,
  ): string | undefined {
    if (isFirst) {
      return 'Start nutrition early before hunger sets in';
    }

    if (phase === 'late' && productType === 'gel') {
      return 'Quick absorbing gels ideal for final push';
    }

    if (phase === 'middle' && timeMinutes % 60 === 0) {
      return 'Consider adding electrolyte tab to water';
    }

    return undefined;
  }

  /**
   * Generate product recommendations based on race duration
   */
  private generateProductRecommendations(
    durationHours: number,
    preferredSources?: CarbSource[],
  ): ProductRecommendation[] {
    const recommendations: ProductRecommendation[] = [];

    if (durationHours < 1) {
      recommendations.push({
        product_type: 'water_only',
        timing_description: 'Throughout race',
        rationale: 'Short duration does not require carbohydrates',
        examples: ['Water', 'Electrolyte drink if hot conditions'],
      });
      return recommendations;
    }

    if (durationHours < 1.5) {
      recommendations.push({
        product_type: 'sports_drink',
        timing_description: 'Every 15-20 minutes',
        rationale: 'Easy to consume, provides both carbs and fluid',
        examples: ['Gatorade Endurance', 'Maurten Drink Mix', 'Skratch Labs'],
      });
      return recommendations;
    }

    // Races 1.5-3 hours
    if (durationHours < 3) {
      recommendations.push({
        product_type: 'gel',
        timing_description: 'Every 30-45 minutes',
        rationale: 'Concentrated carbs, easy to carry and consume',
        examples: ['Maurten Gel 100', 'GU Energy Gel', 'SIS Go Isotonic'],
      });

      recommendations.push({
        product_type: 'sports_drink',
        timing_description: 'At aid stations',
        rationale: 'Supplement gels with fluid and additional carbs',
        examples: ['Tailwind', 'Gatorade', 'Nuun Endurance'],
      });

      return recommendations;
    }

    // Ultra-distance (3+ hours)
    recommendations.push({
      product_type: 'real_food',
      timing_description: 'First half of race',
      rationale: 'Solid food early prevents palate fatigue and provides sustained energy',
      examples: ['Energy bars (Clif, KIND)', 'Banana pieces', 'Rice cakes', 'Boiled potatoes'],
    });

    recommendations.push({
      product_type: 'gel',
      timing_description: 'Second half and final push',
      rationale: 'Quick absorption when digestion slows at higher intensities',
      examples: ['Maurten Gel 100', 'Spring Energy', 'Huma Chia Gels'],
    });

    recommendations.push({
      product_type: 'sports_drink',
      timing_description: 'Throughout, especially in heat',
      rationale: 'Hydration with electrolytes and additional carb source',
      examples: ['Tailwind Endurance Fuel', 'Skratch Labs', 'Precision Hydration'],
    });

    if (preferredSources?.includes('chews')) {
      recommendations.push({
        product_type: 'chews',
        timing_description: 'Alternative to gels mid-race',
        rationale: 'Variety helps prevent flavor fatigue in long events',
        examples: ['Clif Bloks', 'GU Chews', 'Skratch Energy Chews'],
      });
    }

    return recommendations;
  }

  /**
   * Generate GI pacing notes for sensitive athletes
   */
  private generateGiPacingNotes(giSensitivity: GiSensitivity, durationHours: number): string | undefined {
    if (giSensitivity !== 'high' || durationHours < 1.5) {
      return undefined;
    }

    return (
      'High GI Sensitivity Protocol: Start nutrition later (30 min), use smaller more frequent doses (every 20 min), ' +
      'favor liquid calories over solid food, avoid high-fat/high-fiber products, consider maltodextrin-based products ' +
      'which are typically gentler on the stomach. Practice your race nutrition in training!'
    );
  }

  /**
   * Generate caffeine strategy based on race parameters and tolerance
   */
  private generateCaffeineStrategy(
    distanceKm: number,
    durationHours: number,
    estimatedTimeSeconds: number,
    caffeineTolerance?: CaffeineTolerance,
  ): CaffeineStrategy | undefined {
    // No caffeine recommendation for those with no tolerance
    if (caffeineTolerance === 'none') {
      return undefined;
    }

    // Skip caffeine for short races
    if (distanceKm < 15 && durationHours < 1) {
      return undefined;
    }

    // Base dosage by tolerance
    let preRaceDose: number;
    switch (caffeineTolerance) {
      case 'low':
        preRaceDose = 100;
        break;
      case 'moderate':
        preRaceDose = 200;
        break;
      case 'high':
        preRaceDose = 300;
        break;
      default:
        preRaceDose = 200; // Default moderate
    }

    const strategy: CaffeineStrategy = {
      pre_race_mg: preRaceDose,
      pre_race_timing_minutes: 45, // 45 min before start for peak blood levels
    };

    // Add on-course caffeine for long races
    if (durationHours > 2.5 && caffeineTolerance !== 'low') {
      // Second dose at ~60-70% of race (when effects start to wane)
      const onCourseTiming = Math.round((estimatedTimeSeconds / 60) * 0.65);
      const onCourseDose = caffeineTolerance === 'high' ? 100 : 50;

      strategy.on_course_mg = onCourseDose;
      strategy.on_course_timing_minutes = onCourseTiming;
    }

    return strategy;
  }
}
