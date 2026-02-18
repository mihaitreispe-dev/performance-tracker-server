import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum IntegrationProvider {
  STRAVA = 'strava',
  GARMIN = 'garmin',
  APPLE_HEALTH = 'apple_health',
  FITBIT = 'fitbit',
}

export interface UserIntegrationsTable {
  id: Generated<string>;
  user_id: string;
  provider: IntegrationProvider;
  external_user_id: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: Timestamp | null;
  scopes: string | null;
  is_active: Generated<boolean>;
  last_sync_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type UserIntegration = Selectable<UserIntegrationsTable>;
export type NewUserIntegration = Insertable<UserIntegrationsTable>;
export type UserIntegrationUpdate = Updateable<UserIntegrationsTable>;
