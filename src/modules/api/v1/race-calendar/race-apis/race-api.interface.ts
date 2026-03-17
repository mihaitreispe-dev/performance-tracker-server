export interface RaceSearchParams {
  eventType?: 'run' | 'cycle' | 'triathlon' | 'swim';
  location?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export type EventSource = 'active' | 'runsignup' | 'worldtriathlon' | 'opentrack';

export interface ExternalRaceEvent {
  externalId: string;
  source: EventSource;
  name: string;
  description: string | null;
  eventType: 'run' | 'cycle' | 'triathlon' | 'swim';
  date: Date;
  locationCity: string | null;
  locationCountry: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  elevationGainMeters: number | null;
  url: string | null;
}

export interface RaceApiAdapter {
  readonly source: EventSource;
  search(params: RaceSearchParams): Promise<ExternalRaceEvent[]>;
  getDetails(externalId: string): Promise<ExternalRaceEvent | null>;
}
