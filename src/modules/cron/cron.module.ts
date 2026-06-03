import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdvancedMetricsApiModule } from 'src/modules/api/v1/advanced-metrics/advanced-metrics-api.module';
import { ScheduledPromptsModule } from 'src/modules/api/v1/coaching/scheduled-prompts/scheduled-prompts.module';
import { NotificationsApiModule } from 'src/modules/api/v1/notifications/notifications-api.module';
import { NotificationRulesModule } from 'src/modules/notification-rules/notification-rules.module';
import { RacePredictionApiModule } from 'src/modules/api/v1/race-prediction/race-prediction-api.module';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { LocalTranscodeModule } from 'src/modules/local-transcode/local-transcode.module';
import { MediaConvertModule } from 'src/modules/mediaconvert/mediaconvert.module';
import { OpenWearablesModule } from 'src/modules/openwearables/openwearables.module';
import { SmartCropModule } from 'src/modules/smart-crop/smart-crop.module';
import { AthleteIntakeRepository } from 'src/repositories/athlete-intake.repository';
import { AthleteRaceRepository } from 'src/repositories/athlete-race.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { CoachScheduledPromptRepository } from 'src/repositories/coach-scheduled-prompt.repository';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { PainLogRepository } from 'src/repositories/pain-log.repository';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';
import { RaceEventRepository } from 'src/repositories/race-event.repository';
import { RacePlanRepository } from 'src/repositories/race-plan.repository';
import { RacePredictionRepository } from 'src/repositories/race-prediction.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { WearableProviderConnectionRepository } from 'src/repositories/wearable-provider-connection.repository';
import { WeatherForecastRepository } from 'src/repositories/weather-forecast.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { CoachAlertsCronService } from './coach-alerts-cron.service';
import { CronService } from './cron.service';
import { LoadModelingCronService } from './load-modeling-cron.service';
import { PredictionCronService } from './prediction-cron.service';
import { ScheduledPromptsCronService } from './scheduled-prompts-cron.service';
import { WeatherRefreshCronService } from './weather-refresh-cron.service';

@Module({
  imports: [
    ScheduleModule,
    AppConfigModule.register(),
    MediaConvertModule.register(),
    SmartCropModule.register(),
    LocalTranscodeModule.register(),
    OpenWearablesModule.register(),
    ScheduledPromptsModule.register(),
    NotificationsApiModule.register(),
    NotificationRulesModule.register(),
    AdvancedMetricsApiModule.register(),
    RacePredictionApiModule.register(),
  ],
  providers: [
    CronService,
    ScheduledPromptsCronService,
    CoachAlertsCronService,
    LoadModelingCronService,
    PredictionCronService,
    WeatherRefreshCronService,
    AthleteIntakeRepository,
    AthleteRaceRepository,
    CoachAthleteRelationshipRepository,
    CoachScheduledPromptRepository,
    ContentItemRepository,
    ExerciseRepository,
    FitnessMetricsRepository,
    PainLogRepository,
    PersonalRecordRepository,
    RaceEventRepository,
    RacePlanRepository,
    RacePredictionRepository,
    UserRepository,
    WearableProviderConnectionRepository,
    WeatherForecastRepository,
    WorkoutScheduleRepository,
  ],
  exports: [PredictionCronService],
})
export class CronModule {}
