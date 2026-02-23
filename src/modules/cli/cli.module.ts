import { Module } from '@nestjs/common';

import { MigrateScheduleDatesModule } from './migrate-schedule-dates/migrate-schedule-dates.module';
import { PopulateExercisesModule } from './populate-exercises/populate-exercises.module';

@Module({
  imports: [PopulateExercisesModule.register(), MigrateScheduleDatesModule.register()],
})
export class CliModule {}
