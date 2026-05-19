import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * API keys issued to an organisation so they can drive the public consumption
 * surface (workouts, courses, snacks, exercises). Live and test keys share the
 * same row shape; the prefix carries the band (sz_live_ vs sz_test_).
 */
export interface OrganisationApiKeysTable {
  id: Generated<string>;
  organisation_id: string;
  /** Human-readable label set by the org admin ("Production", "Mobile app", ...). */
  name: string;
  /** First ~12 chars of the key, stored cleartext for fast lookup + UI display. */
  key_prefix: string;
  /** bcrypt hash of the *full* key. The cleartext is shown to the operator once. */
  key_hash: string;
  /**
   * Coarse permission strings the key may use against /v1/public/*. Stored as
   * Postgres text[]; downstream code treats it as a Set<string>.
   */
  scopes: ColumnType<string[], string[] | undefined, string[]>;
  /**
   * Debounced last-use timestamp. The auth guard only writes this if the previous
   * value is older than ~60s, so a hot key doesn't hammer the row on every hit.
   */
  last_used_at: Timestamp | null;
  revoked_at: Timestamp | null;
  expires_at: Timestamp | null;
  created_by_user_id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type OrganisationApiKey = Selectable<OrganisationApiKeysTable>;
export type NewOrganisationApiKey = Insertable<OrganisationApiKeysTable>;
export type OrganisationApiKeyUpdate = Updateable<OrganisationApiKeysTable>;
