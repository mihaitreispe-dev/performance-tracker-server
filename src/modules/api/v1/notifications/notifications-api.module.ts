import { DynamicModule, Global, Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { NotificationRepository } from 'src/repositories/notification.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { NotificationsApiController } from './notifications-api.controller';
import { NotificationsApiService } from './notifications-api.service';

@Global() // Make the notification service globally available
@Module({})
export class NotificationsApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: NotificationsApiModule,
        imports: [AuthModule.register()],
        providers: [NotificationsApiService, NotificationRepository, UserRepository],
        controllers: [NotificationsApiController],
        exports: [NotificationsApiService], // Export so other modules can use it
      };
    }
    return this.instance;
  }
}
