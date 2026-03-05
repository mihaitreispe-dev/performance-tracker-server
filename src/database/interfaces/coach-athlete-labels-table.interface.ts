import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface CoachAthleteLabelsTable {
  id: Generated<string>;
  coach_id: string;
  athlete_id: string;
  label: string;
  color: string;
  start_date: string;
  end_date: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type CoachAthleteLabelRow = Selectable<CoachAthleteLabelsTable>;
export type NewCoachAthleteLabel = Insertable<CoachAthleteLabelsTable>;
export type CoachAthleteLabelUpdate = Updateable<CoachAthleteLabelsTable>;
