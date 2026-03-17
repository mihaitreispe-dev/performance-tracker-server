import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from 'src/modules/config/app-config.service';

import { ExternalRaceEvent, RaceApiAdapter, RaceSearchParams } from './race-api.interface';

/**
 * World Triathlon API adapter for triathlon event search.
 * Official ITU/World Triathlon data covering all triathlon events globally.
 *
 * API Documentation: https://developers.triathlon.org/
 */
@Injectable()
export class WorldTriathlonService implements RaceApiAdapter {
  private readonly logger = new Logger(WorldTriathlonService.name);
  readonly source = 'worldtriathlon' as const;

  private readonly baseUrl = 'https://api.triathlon.org/v1';

  constructor(private readonly configService: AppConfigService) {}

  private get apiKey(): string | null {
    return this.configService.worldTriathlonApiKey ?? null;
  }

  async search(params: RaceSearchParams): Promise<ExternalRaceEvent[]> {
    if (!this.apiKey) {
      this.logger.debug('World Triathlon API key not configured, skipping search');
      return [];
    }

    // Only search triathlon events
    if (params.eventType && params.eventType !== 'triathlon') {
      this.logger.debug(`Skipping World Triathlon search for event type: ${params.eventType}`);
      return [];
    }

    this.logger.log(`Searching World Triathlon with params: ${JSON.stringify(params)}`);

    try {
      const queryParams = this.buildSearchParams(params);
      const url = `${this.baseUrl}/events?${queryParams.toString()}`;

      this.logger.debug(`World Triathlon API URL: ${url}`);

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          apikey: this.apiKey,
        },
      });

      if (!response.ok) {
        this.logger.warn(`World Triathlon API returned status ${response.status}`);
        return [];
      }

      const data = await response.json();
      return this.parseSearchResults(data);
    } catch (error) {
      this.logger.error(`Error searching World Triathlon: ${error}`);
      return [];
    }
  }

  async getDetails(externalId: string): Promise<ExternalRaceEvent | null> {
    if (!this.apiKey) {
      return null;
    }

    this.logger.log(`Getting World Triathlon event details for: ${externalId}`);

    try {
      const url = `${this.baseUrl}/events/${externalId}`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          apikey: this.apiKey,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const eventData = (data as { data?: unknown })?.data;
      if (eventData) {
        return this.parseEvent(eventData);
      }
      return null;
    } catch (error) {
      this.logger.error(`Error getting World Triathlon event details: ${error}`);
      return null;
    }
  }

  private buildSearchParams(params: RaceSearchParams): URLSearchParams {
    const query = new URLSearchParams();

    // Date range
    if (params.startDate) {
      query.set('start_date', this.formatDate(params.startDate));
    } else {
      // Default to today for future events
      query.set('start_date', this.formatDate(new Date()));
    }

    if (params.endDate) {
      query.set('end_date', this.formatDate(params.endDate));
    }

    // Location filter by country code
    if (params.location) {
      // Try to match location as country code or name
      const countryCode = this.getCountryCode(params.location);
      if (countryCode) {
        query.set('country_code', countryCode);
      }
    }

    // Event categories (triathlon specific)
    // Categories: world_championship, world_series, continental_cup, etc.
    query.set('per_page', String(params.limit ?? 20));
    query.set('page', String(params.page ?? 1));

    // Sort by date
    query.set('order', 'asc');

    return query;
  }

  private parseSearchResults(data: unknown): ExternalRaceEvent[] {
    const events: ExternalRaceEvent[] = [];

    // Handle World Triathlon API response structure
    const responseData = data as { data?: unknown[] };
    const results = responseData?.data ?? [];

    for (const item of results) {
      try {
        const event = this.parseEvent(item);
        if (event) {
          events.push(event);
        }
      } catch (error) {
        this.logger.warn(`Failed to parse World Triathlon event: ${error}`);
      }
    }

    return events;
  }

  private parseEvent(item: unknown): ExternalRaceEvent | null {
    const data = item as Record<string, unknown>;

    const eventId = data.event_id as number | string;
    const eventTitle = data.event_title as string;

    if (!eventId || !eventTitle) {
      return null;
    }

    // Parse venue/location
    const venue = data.event_venue as string | undefined;
    const countryCode = data.event_country_noc as string | undefined;
    const countryName = this.getCountryName(countryCode ?? '');

    // Parse coordinates if available
    const latitude = data.event_latitude != null ? Number(data.event_latitude) : null;
    const longitude = data.event_longitude != null ? Number(data.event_longitude) : null;

    // Parse date
    const eventDate = data.event_date as string;
    const date = eventDate ? new Date(eventDate) : new Date();

    // Parse event categories/specifications
    const eventSpecifications = data.event_specifications as Record<string, unknown>[] | undefined;
    let distanceMeters: number | null = null;

    if (eventSpecifications && eventSpecifications.length > 0) {
      // Try to find swim/bike/run distances and sum them
      for (const spec of eventSpecifications) {
        const swimDist = spec.swim_distance as number | undefined;
        const bikeDist = spec.bike_distance as number | undefined;
        const runDist = spec.run_distance as number | undefined;

        if (swimDist || bikeDist || runDist) {
          distanceMeters = ((swimDist ?? 0) + (bikeDist ?? 0) + (runDist ?? 0)) * 1000;
          break;
        }
      }
    }

    // Build event URL
    const eventSlug = data.event_slug as string | undefined;
    const url = eventSlug
      ? `https://triathlon.org/events/event/${eventSlug}`
      : `https://triathlon.org/events/event/${eventId}`;

    return {
      externalId: String(eventId),
      source: 'worldtriathlon',
      name: eventTitle,
      description: (data.event_information as string) ?? null,
      eventType: 'triathlon',
      date,
      locationCity: venue ?? null,
      locationCountry: countryName,
      latitude,
      longitude,
      distanceMeters,
      elevationGainMeters: null,
      url,
    };
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // Map common location inputs to ISO country codes
  private getCountryCode(location: string): string | null {
    const locationLower = location.toLowerCase().trim();
    const countryMap: Record<string, string> = {
      usa: 'USA',
      'united states': 'USA',
      uk: 'GBR',
      'united kingdom': 'GBR',
      britain: 'GBR',
      england: 'GBR',
      germany: 'GER',
      france: 'FRA',
      spain: 'ESP',
      italy: 'ITA',
      australia: 'AUS',
      canada: 'CAN',
      japan: 'JPN',
      china: 'CHN',
      brazil: 'BRA',
      mexico: 'MEX',
      netherlands: 'NED',
      belgium: 'BEL',
      switzerland: 'SUI',
      austria: 'AUT',
      portugal: 'POR',
      sweden: 'SWE',
      norway: 'NOR',
      denmark: 'DEN',
      finland: 'FIN',
      ireland: 'IRL',
      'new zealand': 'NZL',
      'south africa': 'RSA',
      singapore: 'SIN',
      'hong kong': 'HKG',
      korea: 'KOR',
      'south korea': 'KOR',
    };

    // Check if it's already a 3-letter code
    if (locationLower.length === 3 && /^[a-z]{3}$/i.test(locationLower)) {
      return locationLower.toUpperCase();
    }

    return countryMap[locationLower] ?? null;
  }

  // Map IOC country codes to country names
  private getCountryName(code: string): string | null {
    const codeMap: Record<string, string> = {
      USA: 'United States',
      GBR: 'United Kingdom',
      GER: 'Germany',
      FRA: 'France',
      ESP: 'Spain',
      ITA: 'Italy',
      AUS: 'Australia',
      CAN: 'Canada',
      JPN: 'Japan',
      CHN: 'China',
      BRA: 'Brazil',
      MEX: 'Mexico',
      NED: 'Netherlands',
      BEL: 'Belgium',
      SUI: 'Switzerland',
      AUT: 'Austria',
      POR: 'Portugal',
      SWE: 'Sweden',
      NOR: 'Norway',
      DEN: 'Denmark',
      FIN: 'Finland',
      IRL: 'Ireland',
      NZL: 'New Zealand',
      RSA: 'South Africa',
      SIN: 'Singapore',
      HKG: 'Hong Kong',
      KOR: 'South Korea',
    };

    return codeMap[code.toUpperCase()] ?? code ?? null;
  }
}
