import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from 'src/modules/config/app-config.service';

import { ExternalRaceEvent, RaceApiAdapter, RaceSearchParams } from './race-api.interface';

/**
 * OpenTrack API adapter for athletics/track & field event search.
 * Integrates with World Athletics data and covers running events globally.
 *
 * API Documentation: https://docs.opentrack.run/
 */
@Injectable()
export class OpenTrackService implements RaceApiAdapter {
  private readonly logger = new Logger(OpenTrackService.name);
  readonly source = 'opentrack' as const;

  private readonly baseUrl = 'https://data.opentrack.run/api/v1';

  constructor(private readonly configService: AppConfigService) {}

  private get apiKey(): string | null {
    return this.configService.opentrackApiKey ?? null;
  }

  async search(params: RaceSearchParams): Promise<ExternalRaceEvent[]> {
    // OpenTrack focuses on running/athletics - skip other event types
    if (params.eventType && params.eventType !== 'run') {
      this.logger.debug(`Skipping OpenTrack search for event type: ${params.eventType}`);
      return [];
    }

    this.logger.log(`Searching OpenTrack with params: ${JSON.stringify(params)}`);

    try {
      const queryParams = this.buildSearchParams(params);
      const url = `${this.baseUrl}/competitions?${queryParams.toString()}`;

      this.logger.debug(`OpenTrack API URL: ${url}`);

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Token ${this.apiKey}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        this.logger.warn(`OpenTrack API returned status ${response.status}`);
        return [];
      }

      const data = await response.json();
      return this.parseSearchResults(data);
    } catch (error) {
      this.logger.error(`Error searching OpenTrack: ${error}`);
      return [];
    }
  }

  async getDetails(externalId: string): Promise<ExternalRaceEvent | null> {
    this.logger.log(`Getting OpenTrack competition details for: ${externalId}`);

    try {
      const url = `${this.baseUrl}/competitions/${externalId}`;

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Token ${this.apiKey}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return this.parseCompetition(data);
    } catch (error) {
      this.logger.error(`Error getting OpenTrack competition details: ${error}`);
      return null;
    }
  }

  private buildSearchParams(params: RaceSearchParams): URLSearchParams {
    const query = new URLSearchParams();

    // Date range
    if (params.startDate) {
      query.set('from', this.formatDate(params.startDate));
    } else {
      // Default to today for future events
      query.set('from', this.formatDate(new Date()));
    }

    if (params.endDate) {
      query.set('to', this.formatDate(params.endDate));
    }

    // Location filter - OpenTrack uses country codes
    if (params.location) {
      const countryCode = this.getCountryCode(params.location);
      if (countryCode) {
        query.set('country', countryCode);
      }
    }

    // Competition type filter - focus on road races and cross country
    // Types: road, track, indoor, cross_country, mountain, ultra
    query.set('type', 'road,cross_country,mountain,ultra');

    // Pagination
    query.set('limit', String(params.limit ?? 20));
    query.set('offset', String(((params.page ?? 1) - 1) * (params.limit ?? 20)));

    return query;
  }

  private parseSearchResults(data: unknown): ExternalRaceEvent[] {
    const events: ExternalRaceEvent[] = [];

    // Handle OpenTrack API response structure
    const responseData = data as { data?: unknown[]; competitions?: unknown[] };
    const results = responseData?.data ?? responseData?.competitions ?? (Array.isArray(data) ? data : []);

    for (const item of results) {
      try {
        const event = this.parseCompetition(item);
        if (event) {
          events.push(event);
        }
      } catch (error) {
        this.logger.warn(`Failed to parse OpenTrack competition: ${error}`);
      }
    }

    return events;
  }

  private parseCompetition(item: unknown): ExternalRaceEvent | null {
    const data = item as Record<string, unknown>;

    const competitionId = (data.id ?? data.slug ?? data.code) as string;
    const name = data.name as string;

    if (!competitionId || !name) {
      return null;
    }

    // Parse venue/location
    const venue = data.venue as Record<string, unknown> | undefined;
    const locationCity = (venue?.city as string) ?? (data.city as string) ?? null;
    const countryCode = (venue?.country as string) ?? (data.country as string) ?? null;
    const countryName = countryCode ? this.getCountryName(countryCode) : null;

    // Parse coordinates
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (venue) {
      latitude = venue.latitude != null ? Number(venue.latitude) : null;
      longitude = venue.longitude != null ? Number(venue.longitude) : null;
    }

    // Parse date
    const startDate = (data.start_date ?? data.date) as string;
    const date = startDate ? new Date(startDate) : new Date();

    // Parse distance from events/races within competition
    let distanceMeters: number | null = null;
    const races = data.races as unknown[] | undefined;
    const events = data.events as unknown[] | undefined;
    const raceList = races ?? events ?? [];

    if (raceList.length > 0) {
      for (const race of raceList) {
        const raceData = race as Record<string, unknown>;
        const distance = raceData.distance as number | string;

        if (distance) {
          const distNum = typeof distance === 'string' ? Number.parseFloat(distance) : distance;
          if (!isNaN(distNum)) {
            // Distance usually in meters for OpenTrack
            distanceMeters = Math.round(distNum);
            break;
          }
        }

        // Try parsing from race name (e.g., "10K", "Marathon")
        const raceName = (raceData.name as string) ?? '';
        const parsed = this.parseDistanceFromName(raceName);
        if (parsed) {
          distanceMeters = parsed;
          break;
        }
      }
    }

    // Fallback: try parsing distance from competition name
    if (!distanceMeters) {
      distanceMeters = this.parseDistanceFromName(name);
    }

    // Build event URL
    const slug = data.slug as string | undefined;
    const url = slug ? `https://data.opentrack.run/x/${slug}` : `https://data.opentrack.run/x/${competitionId}`;

    return {
      externalId: String(competitionId),
      source: 'opentrack',
      name,
      description: (data.description as string) ?? null,
      eventType: 'run',
      date,
      locationCity,
      locationCountry: countryName,
      latitude,
      longitude,
      distanceMeters,
      elevationGainMeters: null,
      url,
    };
  }

  private parseDistanceFromName(name: string): number | null {
    const nameLower = name.toLowerCase();

    // Common race distances
    if (nameLower.includes('marathon') && !nameLower.includes('half')) {
      return 42195; // Full marathon
    }
    if (nameLower.includes('half marathon') || nameLower.includes('half-marathon')) {
      return 21097; // Half marathon
    }

    // Look for patterns like "10K", "5km", "100m"
    const distanceMatch = name.match(/(\d+(?:\.\d+)?)\s*(k|km|mi|mile|m)\b/i);
    if (distanceMatch) {
      const value = Number.parseFloat(distanceMatch[1]);
      const unit = distanceMatch[2].toLowerCase();

      if (unit === 'k' || unit === 'km') {
        return Math.round(value * 1000);
      } else if (unit === 'mi' || unit === 'mile') {
        return Math.round(value * 1609.34);
      } else if (unit === 'm' && value >= 100) {
        // Track events in meters
        return Math.round(value);
      }
    }

    return null;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // Map common location inputs to ISO 3166-1 alpha-2 country codes
  private getCountryCode(location: string): string | null {
    const locationLower = location.toLowerCase().trim();
    const countryMap: Record<string, string> = {
      'usa': 'US',
      'united states': 'US',
      'uk': 'GB',
      'united kingdom': 'GB',
      'britain': 'GB',
      'england': 'GB',
      'germany': 'DE',
      'france': 'FR',
      'spain': 'ES',
      'italy': 'IT',
      'australia': 'AU',
      'canada': 'CA',
      'japan': 'JP',
      'china': 'CN',
      'brazil': 'BR',
      'mexico': 'MX',
      'netherlands': 'NL',
      'belgium': 'BE',
      'switzerland': 'CH',
      'austria': 'AT',
      'portugal': 'PT',
      'sweden': 'SE',
      'norway': 'NO',
      'denmark': 'DK',
      'finland': 'FI',
      'ireland': 'IE',
      'new zealand': 'NZ',
      'south africa': 'ZA',
      'singapore': 'SG',
      'hong kong': 'HK',
      'korea': 'KR',
      'south korea': 'KR',
      'kenya': 'KE',
      'ethiopia': 'ET',
      'poland': 'PL',
      'russia': 'RU',
      'india': 'IN',
    };

    // Check if it's already a 2-letter code
    if (locationLower.length === 2 && /^[a-z]{2}$/i.test(locationLower)) {
      return locationLower.toUpperCase();
    }

    return countryMap[locationLower] ?? null;
  }

  // Map ISO 3166-1 alpha-2 codes to country names
  private getCountryName(code: string): string | null {
    const codeMap: Record<string, string> = {
      US: 'United States',
      GB: 'United Kingdom',
      DE: 'Germany',
      FR: 'France',
      ES: 'Spain',
      IT: 'Italy',
      AU: 'Australia',
      CA: 'Canada',
      JP: 'Japan',
      CN: 'China',
      BR: 'Brazil',
      MX: 'Mexico',
      NL: 'Netherlands',
      BE: 'Belgium',
      CH: 'Switzerland',
      AT: 'Austria',
      PT: 'Portugal',
      SE: 'Sweden',
      NO: 'Norway',
      DK: 'Denmark',
      FI: 'Finland',
      IE: 'Ireland',
      NZ: 'New Zealand',
      ZA: 'South Africa',
      SG: 'Singapore',
      HK: 'Hong Kong',
      KR: 'South Korea',
      KE: 'Kenya',
      ET: 'Ethiopia',
      PL: 'Poland',
      RU: 'Russia',
      IN: 'India',
    };

    return codeMap[code.toUpperCase()] ?? code ?? null;
  }
}
