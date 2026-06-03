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
  /**
   * When true, visitors to the org's client-app subdomain can self-register
   * as general-population clients (creates the Firebase account + an
   * ATHLETE membership with client_type='general', pre-accepted). One-to-one
   * athletes (client_type='athlete') still require an admin-issued invite.
   * Off by default; toggled from the org's Members tab.
   */
  allows_self_signup: Generated<boolean>;
  /**
   * When true, the org has built (or licensed) their own white-label
   * client app that talks to our public API via OAuth + API key. Push
   * notifications + checkout deep-links + onboarding redirects target
   * that app instead of our first-party athlete app.
   *
   * When false (default) the org's clients live in our athlete app.
   * Toggled from the General settings tab.
   */
  uses_external_app: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type Organisation = Selectable<OrganisationsTable>;
export type NewOrganisation = Insertable<OrganisationsTable>;
export type OrganisationUpdate = Updateable<OrganisationsTable>;
