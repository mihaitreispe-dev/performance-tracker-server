import { DynamicModule, Module } from '@nestjs/common';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { CoachScheduledPromptRepository } from 'src/repositories/coach-scheduled-prompt.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { NotificationsApiModule } from '../../notifications/notifications-api.module';
import { ScheduledPromptsController } from './scheduled-prompts.controller';
import { ScheduledPromptsService } from './scheduled-prompts.service';

@Module({})
export class ScheduledPromptsModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: ScheduledPromptsModule,
        imports: [NotificationsApiModule.register()],
        providers: [
          ScheduledPromptsService,
          CoachScheduledPromptRepository,
          CoachAthleteRelationshipRepository,
          UserRepository,
        ],
        controllers: [ScheduledPromptsController],
        exports: [ScheduledPromptsService],
      };
    }
    return this.instance;
  }
}
