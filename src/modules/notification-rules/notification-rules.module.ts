import { DynamicModule, Module } from '@nestjs/common';

import { EmailModule } from 'src/modules/email/email.module';
import { FirebaseModule } from 'src/modules/firebase/firebase.module';
import { NotificationRuleRepository } from 'src/repositories/notification-rule.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { NotificationRulesCronService } from './notification-rules-cron.service';
import { NotificationRulesService } from './notification-rules.service';

/**
 * The notification-rules engine — service + cron driver.
 *
 * Registered globally-importable so:
 *   - the org-admin authoring API (NotificationRulesApiModule) uses
 *     the same service instance the cron does
 *   - event-listener paths in feature modules (e.g. workout-executions
 *     for trigger='on_action_completion' — Phase 7b) can inject the
 *     dispatcher without re-providing it.
 *
 * Cron service is registered here but the @nestjs/schedule global
 * initialization happens in the API app module via ScheduleModule.
 */
@Module({})
export class NotificationRulesModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: NotificationRulesModule,
        imports: [FirebaseModule.register(), EmailModule.register()],
        providers: [
          NotificationRulesService,
          NotificationRulesCronService,
          NotificationRuleRepository,
          UserRepository,
        ],
        exports: [NotificationRulesService, NotificationRuleRepository],
      };
    }
    return this.instance;
  }
}
