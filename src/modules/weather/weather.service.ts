import { Injectable, Logger } from '@nestjs/common';
import { ExecutionWeatherRepository } from 'src/repositories/execution-weather.repository';

import {
  HourlyWeatherData,
  OpenMeteoArchiveResponse,
  WEATHER_DESCRIPTIONS,
  WeatherFetchParams,
} from './types';

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly OPEN_METEO_ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

  constructor(private readonly executionWeatherRepository: ExecutionWeatherRepository) {}

  /**
   * Fetch and store weather data for a workout execution.
   * This is designed to be called asynchronously (fire-and-forget).
   */
  async fetchAndStoreWeather(params: WeatherFetchParams): Promise<void> {
    const { workoutExecutionId, latitude, longitude, startedAt } = params;

    try {
      // Check if weather already exists for this execution
      const existing = await this.executionWeatherRepository.findByExecutionId(workoutExecutionId);
      if (existing) {
        this.logger.debug(`Weather already exists for execution ${workoutExecutionId}`);
        return;
      }

      // Fetch weather data from Open-Meteo
      const weatherData = await this.fetchWeatherFromApi(latitude, longitude, startedAt);
      if (!weatherData) {
        this.logger.warn(`No weather data returned for execution ${workoutExecutionId}`);
        return;
      }

      // Store weather data
      await this.executionWeatherRepository.create({
        workout_execution_id: workoutExecutionId,
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        recorded_at: startedAt,
        temperature_celsius: weatherData.temperatureCelsius?.toString() ?? null,
        feels_like_celsius: weatherData.feelsLikeCelsius?.toString() ?? null,
        humidity_percent: weatherData.humidityPercent,
        wind_speed_kmh: weatherData.windSpeedKmh?.toString() ?? null,
        wind_direction_degrees: weatherData.windDirectionDegrees,
        wind_gusts_kmh: weatherData.windGustsKmh?.toString() ?? null,
        precipitation_mm: weatherData.precipitationMm?.toString() ?? null,
        weather_code: weatherData.weatherCode,
        weather_description: weatherData.weatherDescription,
        cloud_cover_percent: weatherData.cloudCoverPercent,
        pressure_hpa: weatherData.pressureHpa?.toString() ?? null,
        visibility_meters: weatherData.visibilityMeters,
        uv_index: null, // UV index not available in historical API
      });

      this.logger.log(
        `Stored weather for execution ${workoutExecutionId}: ${weatherData.temperatureCelsius}°C, ${weatherData.weatherDescription}`,
      );
    } catch (error) {
      this.logger.error(`Failed to fetch weather for execution ${workoutExecutionId}:`, error);
    }
  }

  /**
   * Fetch weather data from Open-Meteo Historical API
   */
  private async fetchWeatherFromApi(
    latitude: number,
    longitude: number,
    targetTime: Date,
  ): Promise<HourlyWeatherData | null> {
    const dateStr = targetTime.toISOString().split('T')[0]; // YYYY-MM-DD

    const params = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      start_date: dateStr,
      end_date: dateStr,
      hourly: [
        'temperature_2m',
        'relative_humidity_2m',
        'apparent_temperature',
        'precipitation',
        'weather_code',
        'wind_speed_10m',
        'wind_direction_10m',
        'wind_gusts_10m',
        'cloud_cover',
        'pressure_msl',
        'visibility',
      ].join(','),
    });

    const url = `${this.OPEN_METEO_ARCHIVE_URL}?${params.toString()}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        this.logger.error(`Open-Meteo API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data: OpenMeteoArchiveResponse = await response.json();
      return this.findClosestHourData(data, targetTime);
    } catch (error) {
      this.logger.error('Failed to fetch from Open-Meteo API:', error);
      return null;
    }
  }

  /**
   * Find the weather data for the hour closest to the target time
   */
  private findClosestHourData(data: OpenMeteoArchiveResponse, targetTime: Date): HourlyWeatherData | null {
    const { hourly } = data;

    if (!hourly?.time?.length) {
      return null;
    }

    // Find the index of the closest hour
    const targetHour = targetTime.getUTCHours();
    let closestIndex = 0;
    let minDiff = Infinity;

    for (let i = 0; i < hourly.time.length; i++) {
      const time = new Date(hourly.time[i]);
      const hourDiff = Math.abs(time.getUTCHours() - targetHour);
      if (hourDiff < minDiff) {
        minDiff = hourDiff;
        closestIndex = i;
      }
    }

    const weatherCode = hourly.weather_code[closestIndex];

    return {
      time: new Date(hourly.time[closestIndex]),
      temperatureCelsius: hourly.temperature_2m[closestIndex],
      feelsLikeCelsius: hourly.apparent_temperature[closestIndex],
      humidityPercent: hourly.relative_humidity_2m[closestIndex],
      windSpeedKmh: hourly.wind_speed_10m[closestIndex],
      windDirectionDegrees: hourly.wind_direction_10m[closestIndex],
      windGustsKmh: hourly.wind_gusts_10m[closestIndex],
      precipitationMm: hourly.precipitation[closestIndex],
      weatherCode,
      weatherDescription: weatherCode !== null ? (WEATHER_DESCRIPTIONS[weatherCode] ?? 'Unknown') : null,
      cloudCoverPercent: hourly.cloud_cover[closestIndex],
      pressureHpa: hourly.pressure_msl[closestIndex],
      visibilityMeters: hourly.visibility[closestIndex],
    };
  }
}
