import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { WearableDataCategory, WearableProvider } from 'src/database/interfaces';
import { AppConfigService } from 'src/modules/config/app-config.service';

// OpenWearables API types
export interface OWUser {
  id: string;
  external_id?: string;
  created_at: string;
}

export interface OWConnection {
  provider: string;
  status: string;
  connected_at?: string;
  external_user_id?: string;
}

export interface OWWorkout {
  id: string;
  type: string;
  name?: string;
  start_time: string;
  end_time: string;
  duration_seconds?: number;
  source: { provider: string; device_model?: string };
  calories_kcal?: number;
  distance_meters?: number;
  avg_heart_rate_bpm?: number;
  max_heart_rate_bpm?: number;
  avg_pace_sec_per_km?: number;
  elevation_gain_meters?: number;
}

export interface OWSleepSession {
  id: string;
  start_time: string;
  end_time: string;
  source: { provider: string };
  duration_seconds: number;
  efficiency_percent?: number;
  stages?: {
    awake_seconds?: number;
    light_seconds?: number;
    deep_seconds?: number;
    rem_seconds?: number;
  };
  is_nap: boolean;
}

export interface OWTimeSeries {
  timestamp: string;
  type: string;
  value: number;
  unit: string;
  source?: { provider: string };
}

export interface OWActivityAggregate {
  activity_date: string;
  source: string;
  steps_sum?: number;
  active_energy_sum?: number;
  hr_avg?: number;
  hr_max?: number;
  hr_min?: number;
  distance_sum?: number;
}

// Provider capabilities mapping
export const PROVIDER_CAPABILITIES: Record<WearableProvider, WearableDataCategory[]> = {
  [WearableProvider.GARMIN]: [
    WearableDataCategory.WORKOUTS,
    WearableDataCategory.SLEEP,
    WearableDataCategory.HEALTH_METRICS,
  ],
  [WearableProvider.WHOOP]: [
    WearableDataCategory.WORKOUTS,
    WearableDataCategory.SLEEP,
    WearableDataCategory.HEALTH_METRICS,
  ],
  [WearableProvider.OURA]: [WearableDataCategory.SLEEP, WearableDataCategory.HEALTH_METRICS],
  [WearableProvider.POLAR]: [
    WearableDataCategory.WORKOUTS,
    WearableDataCategory.SLEEP,
    WearableDataCategory.HEALTH_METRICS,
  ],
  [WearableProvider.SUUNTO]: [WearableDataCategory.WORKOUTS],
  [WearableProvider.APPLE_HEALTH]: [
    WearableDataCategory.WORKOUTS,
    WearableDataCategory.SLEEP,
    WearableDataCategory.HEALTH_METRICS,
  ],
  [WearableProvider.SAMSUNG_HEALTH]: [
    WearableDataCategory.WORKOUTS,
    WearableDataCategory.SLEEP,
    WearableDataCategory.HEALTH_METRICS,
  ],
  [WearableProvider.FITBIT]: [
    WearableDataCategory.WORKOUTS,
    WearableDataCategory.SLEEP,
    WearableDataCategory.HEALTH_METRICS,
  ],
  [WearableProvider.COROS]: [WearableDataCategory.WORKOUTS, WearableDataCategory.SLEEP],
  [WearableProvider.WAHOO]: [WearableDataCategory.WORKOUTS],
};

@Injectable()
export class OpenWearablesService {
  private readonly logger = new Logger(OpenWearablesService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: AppConfigService,
  ) {
    this.baseUrl = this.configService.openwearablesApiUrl;
    this.apiKey = this.configService.openwearablesApiKey ?? '';
  }

  private getHeaders(): Record<string, string> {
    return {
      'X-Open-Wearables-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Create a user in OpenWearables
   */
  async createUser(externalId: string): Promise<OWUser> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<{ data: OWUser }>(
          `${this.baseUrl}/users`,
          { external_id: externalId },
          { headers: this.getHeaders() },
        ),
      );
      return response.data.data;
    } catch (error) {
      this.handleError('createUser', error);
      throw error;
    }
  }

  /**
   * Get a user from OpenWearables
   */
  async getUser(userId: string): Promise<OWUser | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ data: OWUser }>(`${this.baseUrl}/users/${userId}`, { headers: this.getHeaders() }),
      );
      return response.data.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return null;
      }
      this.handleError('getUser', error);
      throw error;
    }
  }

  /**
   * Get OAuth authorization URL for a provider
   */
  async getOAuthUrl(owUserId: string, provider: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ auth_url: string }>(`${this.baseUrl}/oauth/${provider}/authorize`, {
          params: { user_id: owUserId },
          headers: this.getHeaders(),
        }),
      );
      return response.data.auth_url;
    } catch (error) {
      this.handleError('getOAuthUrl', error);
      throw error;
    }
  }

  /**
   * Get list of available OAuth providers
   */
  async getAvailableProviders(): Promise<string[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ providers: string[] }>(`${this.baseUrl}/oauth/providers`, {
          headers: this.getHeaders(),
        }),
      );
      return response.data.providers;
    } catch (error) {
      this.handleError('getAvailableProviders', error);
      throw error;
    }
  }

  /**
   * Get connected providers for a user
   */
  async getUserConnections(owUserId: string): Promise<OWConnection[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ items: OWConnection[] }>(`${this.baseUrl}/users/${owUserId}/connections`, {
          headers: this.getHeaders(),
        }),
      );
      return response.data.items || [];
    } catch (error) {
      this.handleError('getUserConnections', error);
      throw error;
    }
  }

  /**
   * Trigger a sync for a specific provider
   */
  async triggerSync(owUserId: string, provider: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/providers/${provider}/users/${owUserId}/sync`,
          {},
          { headers: this.getHeaders() },
        ),
      );
    } catch (error) {
      this.handleError('triggerSync', error);
      throw error;
    }
  }

  /**
   * Get workouts for a user
   */
  async getWorkouts(
    owUserId: string,
    options?: { startDate?: string; endDate?: string; cursor?: string; limit?: number },
  ): Promise<{ items: OWWorkout[]; next_cursor?: string; has_more: boolean }> {
    try {
      const params: Record<string, string | number> = {};
      if (options?.startDate) params.start_date = options.startDate;
      if (options?.endDate) params.end_date = options.endDate;
      if (options?.cursor) params.cursor = options.cursor;
      if (options?.limit) params.limit = options.limit;

      const response = await firstValueFrom(
        this.httpService.get<{ items: OWWorkout[]; next_cursor?: string; has_more: boolean }>(
          `${this.baseUrl}/users/${owUserId}/events/workouts`,
          { params, headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('getWorkouts', error);
      throw error;
    }
  }

  /**
   * Get sleep sessions for a user
   */
  async getSleepSessions(
    owUserId: string,
    options?: { startDate?: string; endDate?: string; cursor?: string; limit?: number },
  ): Promise<{ items: OWSleepSession[]; next_cursor?: string; has_more: boolean }> {
    try {
      const params: Record<string, string | number> = {};
      if (options?.startDate) params.start_date = options.startDate;
      if (options?.endDate) params.end_date = options.endDate;
      if (options?.cursor) params.cursor = options.cursor;
      if (options?.limit) params.limit = options.limit;

      const response = await firstValueFrom(
        this.httpService.get<{ items: OWSleepSession[]; next_cursor?: string; has_more: boolean }>(
          `${this.baseUrl}/users/${owUserId}/events/sleep`,
          { params, headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('getSleepSessions', error);
      throw error;
    }
  }

  /**
   * Get time series data (heart rate, HRV, etc.)
   */
  async getTimeSeries(
    owUserId: string,
    seriesType: string,
    options?: { startDate?: string; endDate?: string; cursor?: string; limit?: number },
  ): Promise<{ items: OWTimeSeries[]; next_cursor?: string; has_more: boolean }> {
    try {
      const params: Record<string, string | number> = { type: seriesType };
      if (options?.startDate) params.start_date = options.startDate;
      if (options?.endDate) params.end_date = options.endDate;
      if (options?.cursor) params.cursor = options.cursor;
      if (options?.limit) params.limit = options.limit;

      const response = await firstValueFrom(
        this.httpService.get<{ items: OWTimeSeries[]; next_cursor?: string; has_more: boolean }>(
          `${this.baseUrl}/users/${owUserId}/timeseries`,
          { params, headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('getTimeSeries', error);
      throw error;
    }
  }

  /**
   * Get activity aggregates (daily summaries)
   */
  async getActivityAggregates(
    owUserId: string,
    options?: { startDate?: string; endDate?: string },
  ): Promise<OWActivityAggregate[]> {
    try {
      const params: Record<string, string> = {};
      if (options?.startDate) params.start_date = options.startDate;
      if (options?.endDate) params.end_date = options.endDate;

      const response = await firstValueFrom(
        this.httpService.get<{ items: OWActivityAggregate[] }>(
          `${this.baseUrl}/users/${owUserId}/aggregates/activity`,
          { params, headers: this.getHeaders() },
        ),
      );
      return response.data.items || [];
    } catch (error) {
      this.handleError('getActivityAggregates', error);
      throw error;
    }
  }

  /**
   * Map OpenWearables provider string to our WearableProvider enum
   */
  mapToWearableProvider(owProvider: string): WearableProvider | null {
    const mapping: Record<string, WearableProvider> = {
      garmin: WearableProvider.GARMIN,
      whoop: WearableProvider.WHOOP,
      oura: WearableProvider.OURA,
      polar: WearableProvider.POLAR,
      suunto: WearableProvider.SUUNTO,
      apple_health: WearableProvider.APPLE_HEALTH,
      samsung_health: WearableProvider.SAMSUNG_HEALTH,
      fitbit: WearableProvider.FITBIT,
      coros: WearableProvider.COROS,
      wahoo: WearableProvider.WAHOO,
    };
    return mapping[owProvider.toLowerCase()] || null;
  }

  /**
   * Get provider capabilities
   */
  getProviderCapabilities(provider: WearableProvider): WearableDataCategory[] {
    return PROVIDER_CAPABILITIES[provider] || [];
  }

  private handleError(method: string, error: unknown): void {
    if (error instanceof AxiosError) {
      this.logger.error(
        `OpenWearables API error in ${method}: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`,
      );
    } else {
      this.logger.error(`OpenWearables error in ${method}: ${error}`);
    }
  }
}
