import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum OrganisationRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  COACH = 'coach',
  ATHLETE = 'athlete',
}

export interface OrganisationMembershipsTable {
  id: Generated<string>;
  organisation_id: string;
  user_id: string;
  role: OrganisationRole;
  invited_by_user_id: string | null;
  invited_at: Generated<Timestamp>;
  accepted_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type OrganisationMembership = Selectable<OrganisationMembershipsTable>;
export type NewOrganisationMembership = Insertable<OrganisationMembershipsTable>;
export type OrganisationMembershipUpdate = Updateable<OrganisationMembershipsTable>;
