import { DynamicModule, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { AthleteProfileMetricsRepository } from 'src/repositories/athlete-profile-metrics.repository';
import { AthleteRaceRepository } from 'src/repositories/athlete-race.repository';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { PeriodizationPlanRepository } from 'src/repositories/periodization-plan.repository';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';
import { RaceEventRepository } from 'src/repositories/race-event.repository';
import { RacePredictionRepository } from 'src/repositories/race-prediction.repository';

import { CourseAnalysisService } from '../race-prediction/services/course-analysis.service';
import { CourseFileProcessorService } from '../race-prediction/services/course-file-processor.service';
import { RunningPredictionService } from '../race-prediction/services/running-prediction.service';
import { WorkoutFileParserService } from '../workout-file-imports/workout-file-parser.service';
import { ActiveNetworkService, OpenTrackService, RunSignUpService, WorldTriathlonService } from './race-apis';
import { RaceCalendarApiController } from './race-calendar-api.controller';
import { RaceCalendarApiService } from './race-calendar-api.service';

@Module({})
export class RaceCalendarApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: RaceCalendarApiModule,
        imports: [
          AppConfigModule.register(),
          S3Module.register(),
          MulterModule.register({
            limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
          }),
        ],
        providers: [
          RaceCalendarApiService,
          RaceEventRepository,
          AthleteRaceRepository,
          PeriodizationPlanRepository,
          RacePredictionRepository,
          AthleteProfileMetricsRepository,
          FitnessMetricsRepository,
          PersonalRecordRepository,
          ActiveNetworkService,
          RunSignUpService,
          WorldTriathlonService,
          OpenTrackService,
          CourseFileProcessorService,
          CourseAnalysisService,
          RunningPredictionService,
          WorkoutFileParserService,
        ],
        controllers: [RaceCalendarApiController],
        exports: [RaceCalendarApiService],
      };
    }
    return this.instance;
  }
}
