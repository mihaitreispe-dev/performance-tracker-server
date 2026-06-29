import { DynamicModule, Module } from '@nestjs/common';

import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { QuestAssignmentRepository } from 'src/repositories/quest-assignment.repository';
import { SeasonRepository } from 'src/repositories/season.repository';
import { UserGoalRepository } from 'src/repositories/user-goal.repository';
import { UserProgressionEventRepository } from 'src/repositories/user-progression-event.repository';
import { UserProgressionRepository } from 'src/repositories/user-progression.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { UserSettingsRepository } from 'src/repositories/user-settings.repository';
import { UserUnlockRepository } from 'src/repositories/user-unlock.repository';

import { ProgressionApiController } from './progression-api.controller';
import { ProgressionApiService } from './progression-api.service';

/**
 * Gamified "Journey" progression. Singleton DynamicModule so the API controller
 * and the two completion hooks (workout-executions + content-items) share one
 * ProgressionApiService instance — the hooks award XP; the controller reads it.
 * Repos inject the global Kysely; the service injects the global KYSELY_ROOT.
 */
@Module({})
export class ProgressionApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: ProgressionApiModule,
        providers: [
          ProgressionApiService,
          UserProgressionRepository,
          UserProgressionEventRepository,
          UserGoalRepository,
          QuestAssignmentRepository,
          SeasonRepository,
          UserUnlockRepository,
          CoachAthleteRelationshipRepository,
          UserRepository,
          UserSettingsRepository,
        ],
        controllers: [ProgressionApiController],
        exports: [ProgressionApiService],
      };
    }
    return this.instance;
  }
}
