import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * Two signup tracks. Differ in default verbiage, default-on UI surfaces, and how
 * the org name is chosen at signup time.
 *
 *   organisation — multi-coach team. User explicitly names the org, "Team" surface
 *                  is visible for inviting coaches/admins, default verbiage
 *                  'clients'.
 *   individual   — solo coach. Org name is auto-generated from coach name, no
 *                  separate Team surface, default verbiage 'athletes'.
 */
export enum OrganisationType {
  ORGANISATION = 'organisation',
  INDIVIDUAL = 'individual',
}

export interface OrganisationsTable {
  id: Generated<string>;
  name: string;
  slug: string;
  logo_s3_bucket: string | null;
  logo_s3_key: string | null;
  created_by_user_id: string | null;
  org_type: Generated<OrganisationType>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type Organisation = Selectable<OrganisationsTable>;
export type NewOrganisation = Insertable<OrganisationsTable>;
export type OrganisationUpdate = Updateable<OrganisationsTable>;
