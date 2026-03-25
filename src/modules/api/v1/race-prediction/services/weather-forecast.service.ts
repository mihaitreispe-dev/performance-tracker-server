import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { WeatherForecastRepository } from 'src/repositories/weather-forecast.repository';
import { ForecastConfidence, HourlyForecast, NewWeatherForecast, WeatherForecast } from 'src/database/interfaces';

interface OpenWeatherResponse {
  hourly: {
    dt: number;
    temp: number;
    feels_like: number;
    humidity: number;
    wind_speed: number;
    wind_deg: number;
    wind_gust?: number;
    weather: {
      id: number;
      main: string;
      description: string;
      icon: string;
    }[];
    clouds: number;
    pop: number;
    rain?: { '1h': number };
    uvi?: number;
  }[];
}

@Injectable()
export class WeatherForecastService {
  private readonly logger = new Logger(WeatherForecastService.name);
  private readonly apiKey: string | undefined;

  constructor(
    private readonly weatherForecastRepository: WeatherForecastRepository,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('OPENWEATHER_API_KEY');
  }

  /**
   * Fetch weather forecast from OpenWeather API
   */
  async fetchForecast(
    athleteRaceId: string,
    raceDate: Date,
    latitude: number,
    longitude: number,
    raceStartTime?: string,
  ): Promise<WeatherForecast> {
    if (!this.apiKey) {
      throw new Error('OPENWEATHER_API_KEY is not configured');
    }

    this.logger.log(`Fetching weather forecast for race ${athleteRaceId} at ${latitude},${longitude}`);

    try {
      // OpenWeather One Call API 3.0
      const url = 'https://api.openweathermap.org/data/3.0/onecall';
      const response = await firstValueFrom(
        this.httpService.get<OpenWeatherResponse>(url, {
          params: {
            lat: latitude,
            lon: longitude,
            appid: this.apiKey,
            units: 'metric',
            exclude: 'current,minutely,daily,alerts',
          },
        }),
      );

      const hourlyForecasts: HourlyForecast[] = response.data.hourly.map((hour) => ({
        dt: hour.dt,
        temp: hour.temp,
        feels_like: hour.feels_like,
        humidity: hour.humidity,
        wind_speed: hour.wind_speed * 3.6, // Convert m/s to km/h
        wind_deg: hour.wind_deg,
        wind_gust: hour.wind_gust ? hour.wind_gust * 3.6 : undefined,
        weather: hour.weather,
        clouds: hour.clouds,
        pop: hour.pop,
        rain: hour.rain,
        uvi: hour.uvi,
      }));

      // Calculate forecast confidence based on days until race
      const daysUntilRace = Math.ceil((raceDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const confidence = this.calculateForecastConfidence(daysUntilRace);

      // Extract race-hour summary
      const raceHourForecast = this.extractRaceHourForecast(hourlyForecasts, raceDate, raceStartTime);

      const forecastData: NewWeatherForecast = {
        athlete_race_id: athleteRaceId,
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        race_date: raceDate,
        race_start_time: raceStartTime || null,
        hourly_forecasts: hourlyForecasts,
        race_hour_temperature_celsius: raceHourForecast?.temp?.toString() || null,
        race_hour_humidity_percent: raceHourForecast?.humidity || null,
        race_hour_wind_speed_kmh: raceHourForecast?.wind_speed?.toString() || null,
        race_hour_conditions: raceHourForecast?.weather[0]?.description || null,
        api_provider: 'openweather',
        forecast_confidence: confidence,
      };

      return this.weatherForecastRepository.create(forecastData);
    } catch (error) {
      this.logger.error(`Failed to fetch weather forecast: ${error.message}`, error.stack);
      throw new Error(`Weather API error: ${error.message}`);
    }
  }

  /**
   * Get or refresh forecast for a race
   */
  async getOrRefreshForecast(
    athleteRaceId: string,
    raceDate: Date,
    latitude: number,
    longitude: number,
    raceStartTime?: string,
    forceRefresh = false,
  ): Promise<WeatherForecast | null> {
    if (!this.apiKey) {
      this.logger.warn('OpenWeather API key not configured, skipping forecast');
      return null;
    }

    // Check for existing recent forecast
    if (!forceRefresh) {
      const existing = await this.weatherForecastRepository.findByAthleteRaceId(athleteRaceId);
      if (existing && !this.shouldRefreshForecast(existing, raceDate)) {
        this.logger.log(`Using cached forecast for race ${athleteRaceId}`);
        return existing;
      }
    }

    // Fetch new forecast
    try {
      return await this.fetchForecast(athleteRaceId, raceDate, latitude, longitude, raceStartTime);
    } catch (error) {
      this.logger.warn(`Failed to fetch weather forecast, continuing without weather data: ${error.message}`);
      return null;
    }
  }

  /**
   * Determine if forecast should be refreshed based on age and race proximity
   */
  shouldRefreshForecast(forecast: WeatherForecast, raceDate: Date): boolean {
    const forecastAge = Date.now() - forecast.forecast_date.getTime();
    const daysUntilRace = Math.ceil((raceDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    // Race in the past - don't refresh
    if (daysUntilRace < 0) {
      return false;
    }

    // Less than 1 day out: refresh every 4 hours
    if (daysUntilRace < 1) {
      return forecastAge > 4 * 60 * 60 * 1000;
    }

    // 1-3 days out: refresh every 12 hours
    if (daysUntilRace <= 3) {
      return forecastAge > 12 * 60 * 60 * 1000;
    }

    // 4-7 days out: refresh every 24 hours
    if (daysUntilRace <= 7) {
      return forecastAge > 24 * 60 * 60 * 1000;
    }

    // More than 7 days out: default cache (12 hours)
    return forecastAge > 12 * 60 * 60 * 1000;
  }

  /**
   * Calculate forecast confidence based on days until race
   */
  private calculateForecastConfidence(daysUntilRace: number): ForecastConfidence {
    if (daysUntilRace <= 2) {
      return ForecastConfidence.HIGH;
    } else if (daysUntilRace <= 5) {
      return ForecastConfidence.MEDIUM;
    } else {
      return ForecastConfidence.LOW;
    }
  }

  /**
   * Extract forecast data for the specific race hour
   */
  private extractRaceHourForecast(
    hourlyForecasts: HourlyForecast[],
    raceDate: Date,
    raceStartTime?: string,
  ): HourlyForecast | null {
    // If no start time specified, default to 8:00 AM
    const startTime = raceStartTime || '08:00';
    const [hours, minutes] = startTime.split(':').map(Number);

    const raceDateTime = new Date(raceDate);
    raceDateTime.setHours(hours, minutes, 0, 0);

    // Find the closest hourly forecast to race start time
    const raceTimestamp = Math.floor(raceDateTime.getTime() / 1000);

    let closestForecast: HourlyForecast | null = null;
    let minDiff = Infinity;

    for (const forecast of hourlyForecasts) {
      const diff = Math.abs(forecast.dt - raceTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closestForecast = forecast;
      }
    }

    return closestForecast;
  }

  /**
   * Check if significant weather change occurred (for regeneration trigger)
   */
  hasSignificantWeatherChange(oldForecast: WeatherForecast, newForecast: WeatherForecast): boolean {
    const oldTemp = parseFloat(oldForecast.race_hour_temperature_celsius || '0');
    const newTemp = parseFloat(newForecast.race_hour_temperature_celsius || '0');
    const tempChange = Math.abs(newTemp - oldTemp);

    const oldHumidity = oldForecast.race_hour_humidity_percent || 0;
    const newHumidity = newForecast.race_hour_humidity_percent || 0;
    const humidityChange = Math.abs(newHumidity - oldHumidity);

    const oldWind = parseFloat(oldForecast.race_hour_wind_speed_kmh || '0');
    const newWind = parseFloat(newForecast.race_hour_wind_speed_kmh || '0');
    const windChange = Math.abs(newWind - oldWind);

    // Significant change thresholds
    const TEMP_THRESHOLD = 5; // 5°C
    const HUMIDITY_THRESHOLD = 20; // 20%
    const WIND_THRESHOLD = 15; // 15 km/h

    return tempChange >= TEMP_THRESHOLD || humidityChange >= HUMIDITY_THRESHOLD || windChange >= WIND_THRESHOLD;
  }
}
