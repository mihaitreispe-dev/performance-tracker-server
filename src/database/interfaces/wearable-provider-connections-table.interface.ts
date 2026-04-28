import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum WearableProvider {
  GARMIN = 'garmin',
  WHOOP = 'whoop',
  OURA = 'oura',
  POLAR = 'polar',
  SUUNTO = 'suunto',
  APPLE_HEALTH = 'apple_health',
  SAMSUNG_HEALTH = 'samsung_health',
  FITBIT = 'fitbit',
  COROS = 'coros',
  WAHOO = 'wahoo',
}

export enum WearableDataCategory {
  WORKOUTS = 'workouts',
  SLEEP = 'sleep',
  HEALTH_METRICS = 'health_metrics',
  ACTIVITY = 'activity',
}

export interface WearableProviderConnectionsTable {
  id: Generated<string>;
  user_id: string;
  provider: WearableProvider;
  openwearables_user_id: string;
  external_user_id: string | null;
  is_active: Generated<boolean>;
  supported_categories: WearableDataCategory[];
  last_sync_at: Timestamp | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  connected_at: Timestamp;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type WearableProviderConnection = Selectable<WearableProviderConnectionsTable>;
export type NewWearableProviderConnection = Insertable<WearableProviderConnectionsTable>;
export type WearableProviderConnectionUpdate = Updateable<WearableProviderConnectionsTable>;
