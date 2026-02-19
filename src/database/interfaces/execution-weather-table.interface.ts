import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface ExecutionWeatherTable {
  id: Generated<string>;
  workout_execution_id: string;
  latitude: string;
  longitude: string;
  recorded_at: Timestamp;
  temperature_celsius: string | null;
  feels_like_celsius: string | null;
  humidity_percent: number | null;
  wind_speed_kmh: string | null;
  wind_direction_degrees: number | null;
  wind_gusts_kmh: string | null;
  precipitation_mm: string | null;
  weather_code: number | null;
  weather_description: string | null;
  cloud_cover_percent: number | null;
  pressure_hpa: string | null;
  visibility_meters: number | null;
  uv_index: string | null;
  created_at: Generated<Timestamp>;
}

export type ExecutionWeather = Selectable<ExecutionWeatherTable>;
export type NewExecutionWeather = Insertable<ExecutionWeatherTable>;
export type ExecutionWeatherUpdate = Updateable<ExecutionWeatherTable>;
