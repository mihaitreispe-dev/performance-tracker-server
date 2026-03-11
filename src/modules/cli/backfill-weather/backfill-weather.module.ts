import { DynamicModule, Module } from '@nestjs/common';
import { ConsoleModule } from 'nestjs-console';
import { WeatherModule } from 'src/modules/weather/weather.module';

import { BackfillWeatherService } from './backfill-weather.service';

@Module({})
export class BackfillWeatherModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: BackfillWeatherModule,
        imports: [ConsoleModule, WeatherModule.register()],
        providers: [BackfillWeatherService],
        exports: [BackfillWeatherService],
      };
    }
    return this.instance;
  }
}
