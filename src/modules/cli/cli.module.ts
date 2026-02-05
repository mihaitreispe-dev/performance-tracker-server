import { Module } from '@nestjs/common';

import { PopulateExercisesModule } from './populate-exercises/populate-exercises.module';

@Module({
  imports: [PopulateExercisesModule.register()],
})
export class CliModule {}
