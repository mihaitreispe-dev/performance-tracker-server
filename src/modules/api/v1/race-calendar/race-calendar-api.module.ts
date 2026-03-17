import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { AthleteRaceRepository } from 'src/repositories/athlete-race.repository';
import { PeriodizationPlanRepository } from 'src/repositories/periodization-plan.repository';
import { RaceEventRepository } from 'src/repositories/race-event.repository';

import { ActiveNetworkService, OpenTrackService, RunSignUpService, WorldTriathlonService } from './race-apis';
import { RaceCalendarApiController } from './race-calendar-api.controller';
import { RaceCalendarApiService } from './race-calendar-api.service';

@Module({})
export class RaceCalendarApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: RaceCalendarApiModule,
        imports: [AppConfigModule.register()],
        providers: [
          RaceCalendarApiService,
          RaceEventRepository,
          AthleteRaceRepository,
          PeriodizationPlanRepository,
          ActiveNetworkService,
          RunSignUpService,
          WorldTriathlonService,
          OpenTrackService,
        ],
        controllers: [RaceCalendarApiController],
        exports: [RaceCalendarApiService],
      };
    }
    return this.instance;
  }
}
