import { DynamicModule, Module } from '@nestjs/common';
import { AthletePrivacySettingsRepository } from 'src/repositories/athlete-privacy-settings.repository';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseInstanceRepository } from 'src/repositories/exercise-instance.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { CoachComparisonController, WorkoutComparisonController } from './workout-comparison.controller';
import { WorkoutComparisonService } from './workout-comparison.service';

@Module({})
export class WorkoutComparisonModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: WorkoutComparisonModule,
        providers: [
          WorkoutComparisonService,
          WorkoutExecutionRepository,
          WorkoutScheduleRepository,
          WorkoutRepository,
          CardioMetricsRepository,
          WorkoutRouteRepository,
          SetCompletionRepository,
          ExerciseInstanceRepository,
          ExerciseRepository,
          CoachAthleteRelationshipRepository,
          AthletePrivacySettingsRepository,
          UserRepository,
        ],
        controllers: [WorkoutComparisonController, CoachComparisonController],
        exports: [WorkoutComparisonService],
      };
    }
    return this.instance;
  }
}
