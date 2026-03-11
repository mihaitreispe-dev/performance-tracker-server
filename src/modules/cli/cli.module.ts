import { Module } from '@nestjs/common';

import { BackfillPRsModule } from './backfill-prs/backfill-prs.module';
import { BackfillWeatherModule } from './backfill-weather/backfill-weather.module';
import { MigrateScheduleDatesModule } from './migrate-schedule-dates/migrate-schedule-dates.module';
import { PopulateExercisesModule } from './populate-exercises/populate-exercises.module';
import { SetDefaultSharingModule } from './set-default-sharing/set-default-sharing.module';

@Module({
  imports: [
    BackfillPRsModule.register(),
    BackfillWeatherModule.register(),
    PopulateExercisesModule.register(),
    MigrateScheduleDatesModule.register(),
    SetDefaultSharingModule.register(),
  ],
})
export class CliModule {}
