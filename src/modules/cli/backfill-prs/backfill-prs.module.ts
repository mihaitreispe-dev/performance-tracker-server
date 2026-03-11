import { DynamicModule, Module } from '@nestjs/common';
import { ConsoleModule } from 'nestjs-console';
import { PersonalRecordsApiModule } from 'src/modules/api/v1/personal-records/personal-records-api.module';

import { BackfillPRsService } from './backfill-prs.service';

@Module({})
export class BackfillPRsModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: BackfillPRsModule,
        imports: [ConsoleModule, PersonalRecordsApiModule.register()],
        providers: [BackfillPRsService],
        exports: [BackfillPRsService],
      };
    }
    return this.instance;
  }
}
