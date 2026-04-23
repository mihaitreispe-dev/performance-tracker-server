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
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type AthleteRace = Selectable<AthleteRacesTable>;
export type NewAthleteRace = Insertable<AthleteRacesTable>;
export type AthleteRaceUpdate = Updateable<AthleteRacesTable>;
