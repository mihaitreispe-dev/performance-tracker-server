import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum CoachAthleteStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  DECLINED = 'declined',
  REMOVED = 'removed',
}

export interface CoachAthleteRelationshipsTable {
  id: Generated<string>;
  coach_id: string;
  athlete_id: string;
  status: CoachAthleteStatus;
  invitation_message: string | null;
  invited_at: Generated<Timestamp>;
  responded_at: Timestamp | null;
}

export type CoachAthleteRelationship = Selectable<CoachAthleteRelationshipsTable>;
export type NewCoachAthleteRelationship = Insertable<CoachAthleteRelationshipsTable>;
export type CoachAthleteRelationshipUpdate = Updateable<CoachAthleteRelationshipsTable>;
