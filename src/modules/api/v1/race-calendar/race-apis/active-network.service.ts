import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from 'src/modules/config/app-config.service';

import { ExternalRaceEvent, RaceApiAdapter, RaceSearchParams } from './race-api.interface';

/**
 * ACTIVE Network API adapter for race event search.
 * Uses the ACTIVE.com API which provides access to endurance events.
 *
 * API Documentation: https://developer.active.com/
 * Requires API key registration at https://developer.active.com/
 */
@Injectable()
export class ActiveNetworkService implements RaceApiAdapter {
  private readonly logger = new Logger(ActiveNetworkService.name);
  readonly source = 'active' as const;

  private readonly baseUrl = 'http://api.amp.active.com/v2/search';

  constructor(private readonly configService: AppConfigService) {}

  private get apiKey(): string | null {
    return this.configService.activeApiKey ?? null;
  }

  // Map our event types to ACTIVE's category/topic structure
  private readonly eventTypeMapping: Record<string, string[]> = {
    run: ['running', 'marathon', 'half-marathon', '5k', '10k', 'trail-running', 'ultra'],
    cycle: ['cycling', 'mountain-biking', 'road-cycling', 'gravel'],
    triathlon: ['triathlon', 'duathlon', 'aquathlon'],
    swim: ['swimming', 'open-water-swimming'],
  };

  async search(params: RaceSearchParams): Promise<ExternalRaceEvent[]> {
    if (!this.apiKey) {
      this.logger.debug('ACTIVE Network API key not configured, skipping search');
      return [];
    }

    this.logger.log(`Searching ACTIVE Network with params: ${JSON.stringify(params)}`);

    try {
      const queryParams = this.buildSearchParams(params);
      const url = `${this.baseUrl}?${queryParams.toString()}`;

      this.logger.debug(`ACTIVE API URL: ${url}`);

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        this.logger.warn(`ACTIVE API returned status ${response.status}`);
        return [];
      }

      const data = await response.json();
      return this.parseSearchResults(data);
    } catch (error) {
      this.logger.error(`Error searching ACTIVE Network: ${error}`);
      return [];
    }
  }

  async getDetails(externalId: string): Promise<ExternalRaceEvent | null> {
    if (!this.apiKey) {
      return null;
    }

    this.logger.log(`Getting ACTIVE event details for: ${externalId}`);

    try {
      const queryParams = new URLSearchParams({ api_key: this.apiKey });
      const url = `${this.baseUrl}?asset.assetGuid=${externalId}&${queryParams.toString()}`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const results = this.parseSearchResults(data);
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      this.logger.error(`Error getting ACTIVE event details: ${error}`);
      return null;
    }
  }

  private buildSearchParams(params: RaceSearchParams): URLSearchParams {
    const query = new URLSearchParams();

    // API key
    query.set('api_key', this.apiKey!);

    // Category/topic filter based on event type
    if (params.eventType && this.eventTypeMapping[params.eventType]) {
      query.set('category', 'event');
      query.set('topic', this.eventTypeMapping[params.eventType].join(','));
    } else {
      // Default to running/endurance events
      query.set('category', 'event');
      query.set('topic', 'running,cycling,triathlon,swimming');
    }

    // Location-based search
    if (params.latitude && params.longitude) {
      query.set('lat_lon', `${params.latitude},${params.longitude}`);
      query.set('radius', String(params.radiusKm ?? 50));
    } else if (params.location) {
      query.set('near', params.location);
      query.set('radius', String(params.radiusKm ?? 50));
    }

    // Date range
    if (params.startDate) {
      query.set('start_date', this.formatDate(params.startDate));
    }
    if (params.endDate) {
      query.set('end_date', this.formatDate(params.endDate));
    }

    // Pagination
    query.set('per_page', String(params.limit ?? 20));
    query.set('current_page', String(params.page ?? 1));

    // Sort by date
    query.set('sort', 'date_asc');

    return query;
  }

  private parseSearchResults(data: unknown): ExternalRaceEvent[] {
    const events: ExternalRaceEvent[] = [];

    // Handle ACTIVE API response structure
    const results = (data as { results?: unknown[] })?.results ?? [];

    for (const item of results) {
      try {
        const event = this.parseEvent(item);
        if (event) {
          events.push(event);
        }
      } catch (error) {
        this.logger.warn(`Failed to parse ACTIVE event: ${error}`);
      }
    }

    return events;
  }

  private parseEvent(item: unknown): ExternalRaceEvent | null {
    const data = item as Record<string, unknown>;

    const assetGuid = data.assetGuid as string;
    const assetName = data.assetName as string;

    if (!assetGuid || !assetName) {
      return null;
    }

    // Parse location from place object
    const place = data.place as Record<string, unknown> | undefined;
    const locationCity = (place?.cityName as string) ?? null;
    const locationCountry = (place?.countryName as string) ?? null;
    const latitude = place?.latitude != null ? Number(place.latitude) : null;
    const longitude = place?.longitude != null ? Number(place.longitude) : null;

    // Parse date
    const activityStartDate = data.activityStartDate as string;
    const date = activityStartDate ? new Date(activityStartDate) : new Date();

    // Determine event type from topic/category
    const topic = ((data.topic as string) ?? '').toLowerCase();
    let eventType: 'run' | 'cycle' | 'triathlon' | 'swim' = 'run';
    if (topic.includes('cycling') || topic.includes('bike')) {
      eventType = 'cycle';
    } else if (topic.includes('triathlon') || topic.includes('duathlon')) {
      eventType = 'triathlon';
    } else if (topic.includes('swim')) {
      eventType = 'swim';
    }

    // Parse distance if available
    const assetDescriptions = data.assetDescriptions as Record<string, string>[] | undefined;
    let distanceMeters: number | null = null;
    if (assetDescriptions) {
      for (const desc of assetDescriptions) {
        const text = desc.description ?? '';
        const distanceMatch = text.match(/(\d+(?:\.\d+)?)\s*(km|mi|k|m)/i);
        if (distanceMatch) {
          const value = Number.parseFloat(distanceMatch[1]);
          const unit = distanceMatch[2].toLowerCase();
          if (unit === 'mi') {
            distanceMeters = Math.round(value * 1609.34);
          } else if (unit === 'km' || unit === 'k') {
            distanceMeters = Math.round(value * 1000);
          } else {
            distanceMeters = Math.round(value);
          }
          break;
        }
      }
    }

    return {
      externalId: assetGuid,
      source: 'active',
      name: assetName,
      description: (data.assetDescription as string) ?? null,
      eventType,
      date,
      locationCity,
      locationCountry,
      latitude,
      longitude,
      distanceMeters,
      elevationGainMeters: null,
      url: (data.urlAdr as string) ?? (data.registrationUrlAdr as string) ?? null,
    };
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
