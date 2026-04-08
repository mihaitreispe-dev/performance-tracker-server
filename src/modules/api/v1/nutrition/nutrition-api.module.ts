import { DynamicModule, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

import { FoodRepository } from 'src/repositories/food.repository';
import { FoodLogEntryRepository } from 'src/repositories/food-log-entry.repository';
import { DailyNutritionSummaryRepository } from 'src/repositories/daily-nutrition-summary.repository';
import { UserNutritionGoalsRepository } from 'src/repositories/user-nutrition-goals.repository';
import { UserFrequentFoodRepository } from 'src/repositories/user-frequent-food.repository';
import { AthleteProfileMetricsRepository } from 'src/repositories/athlete-profile-metrics.repository';

import { NutritionApiController } from './nutrition-api.controller';
import { NutritionApiService } from './nutrition-api.service';
import { FoodDatabaseService } from './services/food-database.service';
import { NutritionSummaryService } from './services/nutrition-summary.service';

@Module({})
export class NutritionApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: NutritionApiModule,
        imports: [ConfigModule, HttpModule],
        providers: [
          // Main service
          NutritionApiService,
          // Domain services
          FoodDatabaseService,
          NutritionSummaryService,
          // Repositories
          FoodRepository,
          FoodLogEntryRepository,
          DailyNutritionSummaryRepository,
          UserNutritionGoalsRepository,
          UserFrequentFoodRepository,
          AthleteProfileMetricsRepository,
        ],
        controllers: [NutritionApiController],
        exports: [NutritionApiService, FoodDatabaseService, NutritionSummaryService],
      };
    }
    return this.instance;
  }
}
