import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export const ForecastConfidence = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

export type ForecastConfidence = (typeof ForecastConfidence)[keyof typeof ForecastConfidence];

export interface HourlyForecast {
  dt: number; // Unix timestamp
  temp: number; // Temperature in Celsius
  feels_like: number;
  humidity: number; // Percentage
  wind_speed: number; // km/h
  wind_deg: number; // Degrees
  wind_gust?: number; // km/h
  weather: {
    id: number;
    main: string;
    description: string;
    icon: string;
  }[];
  clouds: number; // Percentage
  pop: number; // Probability of precipitation
  rain?: { '1h': number }; // mm
  uvi?: number; // UV index
}

export interface WeatherForecastsTable {
  id: ColumnType<string, string | undefined, never>;
  athlete_race_id: string;
  latitude: ColumnType<string, string | number, string | number>;
  longitude: ColumnType<string, string | number, string | number>;
  race_date: ColumnType<Date, Date | string, Date | string>;
  race_start_time: ColumnType<string | null, string | null, string | null>;
  forecast_date: ColumnType<Date, never, Date>;
  hourly_forecasts: ColumnType<HourlyForecast[], HourlyForecast[], HourlyForecast[]>;
  race_hour_temperature_celsius: ColumnType<string | null, string | number | null, string | number | null>;
  race_hour_humidity_percent: ColumnType<number | null, number | null, number | null>;
  race_hour_wind_speed_kmh: ColumnType<string | null, string | number | null, string | number | null>;
  race_hour_conditions: ColumnType<string | null, string | null, string | null>;
  api_provider: string;
  forecast_confidence: string;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type WeatherForecast = Selectable<WeatherForecastsTable>;
export type NewWeatherForecast = Insertable<WeatherForecastsTable>;
export type UpdateWeatherForecast = Updateable<WeatherForecastsTable>;
