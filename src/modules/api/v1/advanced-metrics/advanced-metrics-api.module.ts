import { DynamicModule, Module } from '@nestjs/common';
import { AthletePrivacySettingsRepository } from 'src/repositories/athlete-privacy-settings.repository';
import { AthleteProfileMetricsRepository } from 'src/repositories/athlete-profile-metrics.repository';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { DailyHealthMetricRepository } from 'src/repositories/daily-health-metric.repository';
import { FitnessFatigueRepository } from 'src/repositories/fitness-fatigue.repository';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { HrvBaselineRepository } from 'src/repositories/hrv-baseline.repository';
import { LoadModelParametersRepository } from 'src/repositories/load-model-parameters.repository';
import { MultiStreamLoadRepository } from 'src/repositories/multi-stream-load.repository';
import { QuickWellnessCheckinRepository } from 'src/repositories/quick-wellness-checkin.repository';
import { RecoveryJournalRepository } from 'src/repositories/recovery-journal.repository';
import { RpeTssTrackingRepository } from 'src/repositories/rpe-tss-tracking.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { SleepBaselineRepository } from 'src/repositories/sleep-baseline.repository';
import { SleepLogRepository } from 'src/repositories/sleep-log.repository';
import { TrainingStressRepository } from 'src/repositories/training-stress.repository';
import { UserSettingsRepository } from 'src/repositories/user-settings.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { SleepBaselineService } from '../sleep/sleep-baseline.service';
import { SleepScoreService } from '../sleep/sleep-score.service';

import { CoachAthleteRelationshipGuard } from '../coaching/guards/coach-athlete-relationship.guard';

import { AdvancedMetricsApiController } from './advanced-metrics-api.controller';
import { AdvancedMetricsApiService } from './advanced-metrics-api.service';
import { PowerCurveController, PowerCurveCoachController } from './power-curve/power-curve.controller';
import { PowerCurveService } from './power-curve/power-curve.service';
import { RunningPowerController, RunningPowerCoachController } from './running-power/running-power.controller';
import { RunningPowerService } from './running-power/running-power.service';
import { BayesianParameterService } from './services/bayesian-parameter.service';
import { FitnessFatigueService } from './services/fitness-fatigue.service';
import { HrvBaselineService } from './services/hrv-baseline.service';
import { LthrEstimationService } from './services/lthr-estimation.service';
import { MultiStreamLoadService } from './services/multi-stream-load.service';
import { ReadinessService } from './services/readiness.service';
import { TrainingStressService } from './services/training-stress.service';
import { Vo2MaxService } from './services/vo2max.service';
import { SwimMetricsController, SwimMetricsCoachController } from './swim-metrics/swim-metrics.controller';
import { SwimMetricsService } from './swim-metrics/swim-metrics.service';

@Module({})
export class AdvancedMetricsApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: AdvancedMetricsApiModule,
        providers: [
          // API Service
          AdvancedMetricsApiService,
          // Calculation Services
          Vo2MaxService,
          TrainingStressService,
          FitnessFatigueService,
          HrvBaselineService,
          MultiStreamLoadService,
          ReadinessService,
          BayesianParameterService,
          LthrEstimationService,
          // Sport-specific analytics services
          PowerCurveService,
          RunningPowerService,
          SwimMetricsService,
          // Guards
          CoachAthleteRelationshipGuard,
          // Repositories
          FitnessMetricsRepository,
          TrainingStressRepository,
          FitnessFatigueRepository,
          WorkoutExecutionRepository,
          WorkoutRouteRepository,
          WorkoutRepository,
          CardioMetricsRepository,
          UserSettingsRepository,
          MultiStreamLoadRepository,
          HrvBaselineRepository,
          RecoveryJournalRepository,
          LoadModelParametersRepository,
          DailyHealthMetricRepository,
          SetCompletionRepository,
          WorkoutScheduleRepository,
          CoachAthleteRelationshipRepository,
          AthletePrivacySettingsRepository,
          QuickWellnessCheckinRepository,
          RpeTssTrackingRepository,
          AthleteProfileMetricsRepository,
          SleepLogRepository,
          SleepBaselineRepository,
          // Sleep services for readiness integration
          SleepScoreService,
          SleepBaselineService,
        ],
        controllers: [
          AdvancedMetricsApiController,
          PowerCurveController,
          PowerCurveCoachController,
          RunningPowerController,
          RunningPowerCoachController,
          SwimMetricsController,
          SwimMetricsCoachController,
        ],
        exports: [
          AdvancedMetricsApiService,
          FitnessFatigueService,
          HrvBaselineService,
          MultiStreamLoadService,
          ReadinessService,
          BayesianParameterService,
          LoadModelParametersRepository,
          PowerCurveService,
          RunningPowerService,
          SwimMetricsService,
        ],
      };
    }
    return this.instance;
  }
}
