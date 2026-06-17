import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { EventType } from './race-events-table.interface';

export type RacePriority = 'A' | 'B' | 'C';

export interface AthleteRacesTable {
  id: Generated<string>;
  user_id: string;
  race_event_id: string | null;
  // For manual races without external event
  manual_name: string | null;
  manual_date: Date | null;
  manual_event_type: EventType | null;
  manual_distance_meters: number | null;
  // Goals and priority
  goal_time_seconds: number | null;
  priority: RacePriority | null;
  course_file_path: string | null;
  // Start location, derived from the uploaded course file's first route
  // point. Drives the race-day weather forecast now that external
  // race-search providers (which used to supply lat/long) are gone.
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type AthleteRace = Selectable<AthleteRacesTable>;
export type NewAthleteRace = Insertable<AthleteRacesTable>;
export type AthleteRaceUpdate = Updateable<AthleteRacesTable>;
