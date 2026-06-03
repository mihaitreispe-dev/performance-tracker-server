import { DynamicModule, Module } from '@nestjs/common';

import { AuthModule } from 'src/modules/auth/auth.module';
import { NotificationRulesModule } from 'src/modules/notification-rules/notification-rules.module';

import { NotificationRulesApiController } from './notification-rules-api.controller';

/**
 * REST surface for org-admin notification-rule authoring.
 *
 * The engine + cron live in NotificationRulesModule; we re-import it
 * here so the controller can inject NotificationRulesService.
 */
@Module({})
export class NotificationRulesApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: NotificationRulesApiModule,
        imports: [AuthModule.register(), NotificationRulesModule.register()],
        controllers: [NotificationRulesApiController],
      };
    }
    return this.instance;
  }
}
