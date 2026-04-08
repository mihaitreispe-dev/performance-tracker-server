import { DynamicModule, Module } from '@nestjs/common';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { CoachingMessageRepository } from 'src/repositories/coaching-message.repository';
import { QuestionnaireInstanceRepository } from 'src/repositories/questionnaire-instance.repository';
import { QuestionnaireQuestionRepository } from 'src/repositories/questionnaire-question.repository';
import { QuestionnaireResponseRepository } from 'src/repositories/questionnaire-response.repository';
import { QuestionnaireTemplateRepository } from 'src/repositories/questionnaire-template.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { NotificationsApiModule } from '../../notifications/notifications-api.module';
import { InstancesController } from './instances/instances.controller';
import { InstancesService } from './instances/instances.service';
import { ResponsesController } from './responses/responses.controller';
import { ResponsesService } from './responses/responses.service';
import { TemplatesController } from './templates/templates.controller';
import { TemplatesService } from './templates/templates.service';

@Module({})
export class QuestionnairesModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: QuestionnairesModule,
        imports: [NotificationsApiModule.register()],
        providers: [
          // Services
          TemplatesService,
          InstancesService,
          ResponsesService,
          // Repositories
          QuestionnaireTemplateRepository,
          QuestionnaireQuestionRepository,
          QuestionnaireInstanceRepository,
          QuestionnaireResponseRepository,
          CoachAthleteRelationshipRepository,
          CoachingMessageRepository,
          UserRepository,
        ],
        controllers: [TemplatesController, InstancesController, ResponsesController],
        exports: [TemplatesService, InstancesService, ResponsesService],
      };
    }
    return this.instance;
  }
}
