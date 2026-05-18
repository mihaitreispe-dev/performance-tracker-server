import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface OrganisationsTable {
  id: Generated<string>;
  name: string;
  slug: string;
  logo_s3_bucket: string | null;
  logo_s3_key: string | null;
  created_by_user_id: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type Organisation = Selectable<OrganisationsTable>;
export type NewOrganisation = Insertable<OrganisationsTable>;
export type OrganisationUpdate = Updateable<OrganisationsTable>;
