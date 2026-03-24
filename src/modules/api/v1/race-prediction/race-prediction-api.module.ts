import { DynamicModule, forwardRef, Module } from '@nestjs/common';
import { AthleteProfileMetricsRepository } from 'src/repositories/athlete-profile-metrics.repository';
import { AthleteRaceRepository } from 'src/repositories/athlete-race.repository';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { HistoricalRaceResultsRepository } from 'src/repositories/historical-race-results.repository';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';
import { RacePredictionRepository } from 'src/repositories/race-prediction.repository';

import { AdvancedMetricsApiModule } from '../advanced-metrics/advanced-metrics-api.module';
import { WorkoutFileImportsApiModule } from '../workout-file-imports/workout-file-imports-api.module';
import { RacePredictionApiController } from './race-prediction-api.controller';
import { RacePredictionApiService } from './race-prediction-api.service';
import { CourseAnalysisService } from './services/course-analysis.service';
import { CourseFileProcessorService } from './services/course-file-processor.service';
import { CyclingPredictionService } from './services/cycling-prediction.service';
import { RunningPredictionService } from './services/running-prediction.service';
import { TaperOptimizationService } from './services/taper-optimization.service';

@Module({})
export class RacePredictionApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: RacePredictionApiModule,
        imports: [
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
          // Repositories
          RacePredictionRepository,
          AthleteProfileMetricsRepository,
          HistoricalRaceResultsRepository,
          AthleteRaceRepository,
          FitnessMetricsRepository,
          PersonalRecordRepository,
        ],
        controllers: [RacePredictionApiController],
        exports: [RacePredictionApiService, RunningPredictionService, CyclingPredictionService],
      };
    }
    return this.instance;
  }
}
