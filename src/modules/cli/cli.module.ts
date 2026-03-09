import { Module } from '@nestjs/common';

import { MigrateScheduleDatesModule } from './migrate-schedule-dates/migrate-schedule-dates.module';
import { PopulateExercisesModule } from './populate-exercises/populate-exercises.module';
import { SetDefaultSharingModule } from './set-default-sharing/set-default-sharing.module';

@Module({
  imports: [
    PopulateExercisesModule.register(),
    MigrateScheduleDatesModule.register(),
    SetDefaultSharingModule.register(),
  ],
})
export class CliModule {}
