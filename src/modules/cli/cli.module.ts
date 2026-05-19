import { Module } from '@nestjs/common';

import { BackfillPRsModule } from './backfill-prs/backfill-prs.module';
import { BackfillWeatherModule } from './backfill-weather/backfill-weather.module';
import { ImportFoodsModule } from './import-foods/import-foods.module';
import { MigrateScheduleDatesModule } from './migrate-schedule-dates/migrate-schedule-dates.module';
import { PopulateExercisesModule } from './populate-exercises/populate-exercises.module';
import { ReclaimUserResourcesModule } from './reclaim-user-resources/reclaim-user-resources.module';
import { SetDefaultSharingModule } from './set-default-sharing/set-default-sharing.module';

@Module({
  imports: [
    BackfillPRsModule.register(),
    BackfillWeatherModule.register(),
    PopulateExercisesModule.register(),
    MigrateScheduleDatesModule.register(),
    SetDefaultSharingModule.register(),
    ImportFoodsModule.register(),
    ReclaimUserResourcesModule.register(),
  ],
})
export class CliModule {}
