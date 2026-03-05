import { DynamicModule, Module } from '@nestjs/common';
import { AthletePrivacySettingsRepository } from 'src/repositories/athlete-privacy-settings.repository';
import { CoachAssignedWorkoutRepository } from 'src/repositories/coach-assigned-workout.repository';
import { CoachAthleteLabelRepository } from 'src/repositories/coach-athlete-label.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { CoachingMessageRepository } from 'src/repositories/coaching-message.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutPlanRepository } from 'src/repositories/workout-plan.repository';
import { WorkoutPlanItemRepository } from 'src/repositories/workout-plan-item.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { WorkoutsApiModule } from '../workouts/workouts-api.module';
import { WorkoutPlansApiModule } from '../workout-plans/workout-plans-api.module';
import { CoachingApiController } from './coaching-api.controller';
import { CoachingApiService } from './coaching-api.service';
import { CoachAthleteRelationshipGuard } from './guards/coach-athlete-relationship.guard';

@Module({})
export class CoachingApiModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: CoachingApiModule,
        imports: [WorkoutsApiModule.register(), WorkoutPlansApiModule.register()],
        providers: [
          CoachingApiService,
          CoachAthleteRelationshipGuard,
          CoachAthleteRelationshipRepository,
          AthletePrivacySettingsRepository,
          CoachAssignedWorkoutRepository,
          CoachAthleteLabelRepository,
          CoachingMessageRepository,
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
