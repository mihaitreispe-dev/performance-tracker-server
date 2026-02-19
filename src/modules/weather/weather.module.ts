import { DynamicModule, Module } from '@nestjs/common';
import { ExecutionWeatherRepository } from 'src/repositories/execution-weather.repository';

import { WeatherService } from './weather.service';

@Module({})
export class WeatherModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: WeatherModule,
        providers: [WeatherService, ExecutionWeatherRepository],
        exports: [WeatherService],
      };
    }
    return this.instance;
  }
}
