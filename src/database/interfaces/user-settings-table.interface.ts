import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface HRZoneConfig {
  zone: number;
  name: string;
  minPct: number;
  maxPct: number;
}

export interface HRZonesSettings {
  maxHr: number;
  zones: HRZoneConfig[];
}

export interface UserSettingsTable {
  id: Generated<string>;
  user_id: string;
  hr_zones: HRZonesSettings | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type UserSettings = Selectable<UserSettingsTable>;
export type NewUserSettings = Insertable<UserSettingsTable>;
export type UserSettingsUpdate = Updateable<UserSettingsTable>;
