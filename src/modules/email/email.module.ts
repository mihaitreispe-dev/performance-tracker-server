import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/config/app-config.module';

import { EmailService } from './email.service';

@Module({})
export class EmailModule {
  private static instance?: DynamicModule;
  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: EmailModule,
        imports: [AppConfigModule.register()],
        providers: [EmailService],
        exports: [EmailService],
      };
    }
    return this.instance;
  }
}
