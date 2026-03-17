import { Generated, Insertable, Selectable, Updateable } from 'kysely';

export type EventType = 'run' | 'cycle' | 'triathlon' | 'swim';
export type EventSource = 'active' | 'runsignup' | 'worldtriathlon' | 'opentrack' | 'manual';

export interface RaceEventsTable {
  id: Generated<string>;
  external_id: string | null;
  source: EventSource;
  name: string;
  description: string | null;
  event_type: EventType;
  date: Date;
  location_city: string | null;
  location_country: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_meters: number | null;
  elevation_gain_meters: number | null;
  url: string | null;
  cached_at: Generated<Date>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type RaceEvent = Selectable<RaceEventsTable>;
export type NewRaceEvent = Insertable<RaceEventsTable>;
export type RaceEventUpdate = Updateable<RaceEventsTable>;
