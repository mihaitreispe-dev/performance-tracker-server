import { DynamicModule, Module } from '@nestjs/common';
import { AthleteIntakeRepository } from 'src/repositories/athlete-intake.repository';
import { AthletePrivacySettingsRepository } from 'src/repositories/athlete-privacy-settings.repository';
import { CoachAssignedWorkoutRepository } from 'src/repositories/coach-assigned-workout.repository';
import { CoachAthleteLabelRepository } from 'src/repositories/coach-athlete-label.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { CoachingMessageRepository } from 'src/repositories/coaching-message.repository';
import { IllnessLogRepository } from 'src/repositories/illness-log.repository';
import { PainLogRepository } from 'src/repositories/pain-log.repository';
import { QuickWellnessCheckinRepository } from 'src/repositories/quick-wellness-checkin.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutPlanRepository } from 'src/repositories/workout-plan.repository';
import { WorkoutPlanItemRepository } from 'src/repositories/workout-plan-item.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { AdvancedMetricsApiModule } from '../advanced-metrics/advanced-metrics-api.module';
import { AnalyticsApiModule } from '../analytics/analytics-api.module';
import { RaceCalendarApiModule } from '../race-calendar/race-calendar-api.module';
import { WorkoutPlansApiModule } from '../workout-plans/workout-plans-api.module';
import { WorkoutsApiModule } from '../workouts/workouts-api.module';
import { CoachingApiController } from './coaching-api.controller';
import { CoachingApiService } from './coaching-api.service';
import { CoachAthleteRelationshipGuard } from './guards/coach-athlete-relationship.guard';
import { QuestionnairesModule } from './questionnaires/questionnaires.module';
import { ScheduledPromptsModule } from './scheduled-prompts/scheduled-prompts.module';

@Module({})
export class CoachingApiModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: CoachingApiModule,
        imports: [
          WorkoutsApiModule.register(),
          WorkoutPlansApiModule.register(),
          AnalyticsApiModule.register(),
          AdvancedMetricsApiModule.register(),
          ScheduledPromptsModule.register(),
          QuestionnairesModule.register(),
          RaceCalendarApiModule.register(),
        ],
        providers: [
          CoachingApiService,
          CoachAthleteRelationshipGuard,
          CoachAthleteRelationshipRepository,
          AthletePrivacySettingsRepository,
          AthleteIntakeRepository,
          CoachAssignedWorkoutRepository,
          CoachAthleteLabelRepository,
          CoachingMessageRepository,
          QuickWellnessCheckinRepository,
          IllnessLogRepository,
          PainLogRepository,
          UserRepository,
          WorkoutRepository,
          WorkoutScheduleRepository,
          WorkoutExecutionRepository,
          WorkoutRouteRepository,
          WorkoutPlanRepository,
          WorkoutPlanItemRepository,
        ],
        controllers: [CoachingApiController],
      };
    }
    return this.instance;
  }
}
