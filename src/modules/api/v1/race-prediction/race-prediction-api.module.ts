import { DynamicModule, forwardRef, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AthleteProfileMetricsRepository } from 'src/repositories/athlete-profile-metrics.repository';
import { AthleteRaceRepository } from 'src/repositories/athlete-race.repository';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { HistoricalRaceResultsRepository } from 'src/repositories/historical-race-results.repository';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';
import { RaceEventRepository } from 'src/repositories/race-event.repository';
import { RacePredictionRepository } from 'src/repositories/race-prediction.repository';
import { RacePlanRepository } from 'src/repositories/race-plan.repository';
import { WeatherForecastRepository } from 'src/repositories/weather-forecast.repository';

import { AdvancedMetricsApiModule } from '../advanced-metrics/advanced-metrics-api.module';
import { WorkoutFileImportsApiModule } from '../workout-file-imports/workout-file-imports-api.module';
import { RacePredictionApiController } from './race-prediction-api.controller';
import { RacePredictionApiService } from './race-prediction-api.service';
import { CourseAnalysisService } from './services/course-analysis.service';
import { CourseFileProcessorService } from './services/course-file-processor.service';
import { CyclingPredictionService } from './services/cycling-prediction.service';
import { RunningPredictionService } from './services/running-prediction.service';
import { TaperOptimizationService } from './services/taper-optimization.service';
import { WeatherForecastService } from './services/weather-forecast.service';
import { WeatherAdjustmentService } from './services/weather-adjustment.service';
import { PacingStrategyService } from './services/pacing-strategy.service';
import { RacePlanGeneratorService } from './services/race-plan-generator.service';
import { NutritionPlanService } from './services/nutrition-plan.service';

@Module({})
export class RacePredictionApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: RacePredictionApiModule,
        imports: [
          ConfigModule,
          HttpModule,
          AdvancedMetricsApiModule.register(),
          WorkoutFileImportsApiModule.register(),
        ],
        providers: [
          // Main service
          RacePredictionApiService,
          // Prediction services
          RunningPredictionService,
          CyclingPredictionService,
          TaperOptimizationService,
          CourseAnalysisService,
          CourseFileProcessorService,
          // Race plan services
          RacePlanGeneratorService,
          NutritionPlanService,
          WeatherForecastService,
          WeatherAdjustmentService,
          PacingStrategyService,
          // Repositories
          RacePredictionRepository,
          RacePlanRepository,
          WeatherForecastRepository,
          AthleteProfileMetricsRepository,
          HistoricalRaceResultsRepository,
          AthleteRaceRepository,
          RaceEventRepository,
          FitnessMetricsRepository,
          PersonalRecordRepository,
        ],
        controllers: [RacePredictionApiController],
        exports: [
          RacePredictionApiService,
          RunningPredictionService,
          CyclingPredictionService,
          RacePlanGeneratorService,
          WeatherForecastService,
        ],
      };
    }
    return this.instance;
  }
}
