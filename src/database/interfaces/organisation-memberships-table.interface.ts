import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/** Arbitrary key/value bag the integrating app uses to stash external profile data. */
export type MembershipMetadata = Record<string, unknown>;

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
  /** Optional personal note from the inviter, shown alongside the pending invitation. */
  invitation_message: string | null;
  /** External per-(user, org) profile data set by the integrating app. */
  metadata: ColumnType<MembershipMetadata, MembershipMetadata | undefined, MembershipMetadata>;
  invited_at: Generated<Timestamp>;
  accepted_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type OrganisationMembership = Selectable<OrganisationMembershipsTable>;
export type NewOrganisationMembership = Insertable<OrganisationMembershipsTable>;
export type OrganisationMembershipUpdate = Updateable<OrganisationMembershipsTable>;
