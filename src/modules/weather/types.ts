/**
 * WMO Weather Code to Description Mapping
 * Reference: https://open-meteo.com/en/docs
 */
export const WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

/**
 * Response from Open-Meteo Historical Weather API
 */
export interface OpenMeteoArchiveResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  hourly_units: {
    time: string;
    temperature_2m: string;
    relative_humidity_2m: string;
    apparent_temperature: string;
    precipitation: string;
    weather_code: string;
    wind_speed_10m: string;
    wind_direction_10m: string;
    wind_gusts_10m: string;
    cloud_cover: string;
    pressure_msl: string;
    visibility: string;
  };
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    relative_humidity_2m: (number | null)[];
    apparent_temperature: (number | null)[];
    precipitation: (number | null)[];
    weather_code: (number | null)[];
    wind_speed_10m: (number | null)[];
    wind_direction_10m: (number | null)[];
    wind_gusts_10m: (number | null)[];
    cloud_cover: (number | null)[];
    pressure_msl: (number | null)[];
    visibility: (number | null)[];
  };
}

/**
 * Parsed weather data for a specific hour
 */
export interface HourlyWeatherData {
  time: Date;
  temperatureCelsius: number | null;
  feelsLikeCelsius: number | null;
  humidityPercent: number | null;
  windSpeedKmh: number | null;
  windDirectionDegrees: number | null;
  windGustsKmh: number | null;
  precipitationMm: number | null;
  weatherCode: number | null;
  weatherDescription: string | null;
  cloudCoverPercent: number | null;
  pressureHpa: number | null;
  visibilityMeters: number | null;
}

/**
 * Data needed to fetch weather for a workout execution
 */
export interface WeatherFetchParams {
  workoutExecutionId: string;
  latitude: number;
  longitude: number;
  startedAt: Date;
}
