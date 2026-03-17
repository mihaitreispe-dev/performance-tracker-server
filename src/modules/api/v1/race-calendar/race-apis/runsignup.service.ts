import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from 'src/modules/config/app-config.service';

import { ExternalRaceEvent, RaceApiAdapter, RaceSearchParams } from './race-api.interface';

/**
 * RunSignUp API adapter for race event search.
 * RunSignUp is one of the largest race registration platforms in the US.
 *
 * API Documentation: https://runsignup.com/API
 * Note: Requires API key for production use.
 */
@Injectable()
export class RunSignUpService implements RaceApiAdapter {
  private readonly logger = new Logger(RunSignUpService.name);
  readonly source = 'runsignup' as const;

  private readonly baseUrl = 'https://runsignup.com/Rest';

  constructor(private readonly configService: AppConfigService) {}

  private get apiKey(): string | null {
    return this.configService.runsignupApiKey ?? null;
  }

  async search(params: RaceSearchParams): Promise<ExternalRaceEvent[]> {
    if (!this.apiKey) {
      this.logger.debug('RunSignUp API key not configured, skipping search');
      return [];
    }

    this.logger.log(`Searching RunSignUp with params: ${JSON.stringify(params)}`);

    try {
      const queryParams = this.buildSearchParams(params);
      const url = `${this.baseUrl}/races?${queryParams.toString()}`;

      this.logger.debug(`RunSignUp API URL: ${url}`);

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        this.logger.warn(`RunSignUp API returned status ${response.status}`);
        return [];
      }

      const data = await response.json();
      return this.parseSearchResults(data);
    } catch (error) {
      this.logger.error(`Error searching RunSignUp: ${error}`);
      return [];
    }
  }

  async getDetails(externalId: string): Promise<ExternalRaceEvent | null> {
    if (!this.apiKey) {
      return null;
    }

    this.logger.log(`Getting RunSignUp race details for: ${externalId}`);

    try {
      const queryParams = new URLSearchParams({
        api_key: this.apiKey,
        api_secret: 'demo', // Use actual secret in production
        format: 'json',
      });

      const url = `${this.baseUrl}/race/${externalId}?${queryParams.toString()}`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const raceData = (data as { race?: unknown })?.race;
      if (raceData) {
        return this.parseRace(raceData);
      }
      return null;
    } catch (error) {
      this.logger.error(`Error getting RunSignUp race details: ${error}`);
      return null;
    }
  }

  private buildSearchParams(params: RaceSearchParams): URLSearchParams {
    const query = new URLSearchParams();

    query.set('api_key', this.apiKey!);
    query.set('api_secret', 'demo'); // Use actual secret in production
    query.set('format', 'json');

    // Location search
    if (params.location) {
      query.set('name', params.location);
      // Or use zipcode/city/state for US races
    }

    if (params.latitude && params.longitude) {
      query.set('latitude', String(params.latitude));
      query.set('longitude', String(params.longitude));
      query.set('distance', String(params.radiusKm ?? 50));
      query.set('distance_units', 'K'); // Kilometers
    }

    // Date range
    if (params.startDate) {
      query.set('start_date', this.formatDate(params.startDate));
    }
    if (params.endDate) {
      query.set('end_date', this.formatDate(params.endDate));
    }

    // Event type filter
    if (params.eventType) {
      const sportMapping: Record<string, string> = {
        run: 'running',
        cycle: 'cycling',
        triathlon: 'triathlon',
        swim: 'swimming',
      };
      query.set('sport', sportMapping[params.eventType] ?? 'running');
    }

    // Pagination
    query.set('page', String(params.page ?? 1));
    query.set('results_per_page', String(params.limit ?? 20));

    // Only future events
    query.set('only_partner_races', 'F');
    query.set('include_event_days', 'T');

    return query;
  }

  private parseSearchResults(data: unknown): ExternalRaceEvent[] {
    const events: ExternalRaceEvent[] = [];

    const races = (data as { races?: unknown[] })?.races ?? [];

    for (const item of races) {
      try {
        const raceContainer = item as { race?: unknown };
        const race = raceContainer.race ?? item;
        const event = this.parseRace(race);
        if (event) {
          events.push(event);
        }
      } catch (error) {
        this.logger.warn(`Failed to parse RunSignUp race: ${error}`);
      }
    }

    return events;
  }

  private parseRace(item: unknown): ExternalRaceEvent | null {
    const data = item as Record<string, unknown>;

    const raceId = data.race_id as number | string;
    const name = data.name as string;

    if (!raceId || !name) {
      return null;
    }

    // Parse address
    const address = data.address as Record<string, unknown> | undefined;
    const locationCity = (address?.city as string) ?? null;
    const locationCountry = (address?.country_code as string) ?? 'US';
    const latitude = address?.lat != null ? Number(address.lat) : null;
    const longitude = address?.lng != null ? Number(address.lng) : null;

    // Parse date from next_date or events array
    let date = new Date();
    const nextDate = data.next_date as string;
    if (nextDate) {
      date = new Date(nextDate);
    } else {
      const events = data.events as unknown[] | undefined;
      if (events && events.length > 0) {
        const firstEvent = events[0] as Record<string, unknown>;
        const startTime = firstEvent.start_time as string;
        if (startTime) {
          date = new Date(startTime);
        }
      }
    }

    // Determine event type
    const sport = ((data.sport as string) ?? '').toLowerCase();
    let eventType: 'run' | 'cycle' | 'triathlon' | 'swim' = 'run';
    if (sport.includes('cycling') || sport.includes('bike')) {
      eventType = 'cycle';
    } else if (sport.includes('triathlon')) {
      eventType = 'triathlon';
    } else if (sport.includes('swim')) {
      eventType = 'swim';
    }

    // Parse distance from events
    let distanceMeters: number | null = null;
    const events = data.events as unknown[] | undefined;
    if (events && events.length > 0) {
      for (const event of events) {
        const eventData = event as Record<string, unknown>;
        const distance = eventData.distance as number;
        const distanceUnit = (eventData.distance_unit as string) ?? '';

        if (distance) {
          if (distanceUnit.toLowerCase().includes('mile')) {
            distanceMeters = Math.round(distance * 1609.34);
          } else if (distanceUnit.toLowerCase().includes('k')) {
            distanceMeters = Math.round(distance * 1000);
          } else {
            distanceMeters = Math.round(distance);
          }
          break;
        }
      }
    }

    return {
      externalId: String(raceId),
      source: 'runsignup',
      name,
      description: (data.description as string) ?? null,
      eventType,
      date,
      locationCity,
      locationCountry,
      latitude,
      longitude,
      distanceMeters,
      elevationGainMeters: null,
      url: (data.url as string) ?? `https://runsignup.com/Race/${raceId}`,
    };
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
