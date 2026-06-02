import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

// Base training zone structure used by all zone types
export interface TrainingZone {
  zone: number; // 1-7
  name: string; // "Recovery", "Tempo", etc.
  minValue: number; // Min in absolute units
  maxValue: number; // Max in absolute units
  color?: string; // Optional custom color
}

// HR zones (existing - percentage based)
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

// Power zones (% of FTP)
export interface PowerZonesSettings {
  ftp: number; // Functional Threshold Power in watts
  zones: TrainingZone[]; // Values stored as percentages of FTP
}

// Pace zones (seconds per km)
export interface PaceZonesSettings {
  thresholdPace: number; // Threshold pace in seconds per km
  zones: TrainingZone[]; // Values stored as percentages of threshold
}

// RPE zones (direct 1-10 scale values)
export interface RPEZonesSettings {
  zones: TrainingZone[]; // Values are direct 1-10 scale
}

// Combined training zones settings
export interface TrainingZonesSettings {
  hrZones?: HRZonesSettings | null;
  powerZones?: PowerZonesSettings | null;
  paceZones?: PaceZonesSettings | null;
  rpeZones?: RPEZonesSettings | null;
}

export interface UserSettingsTable {
  id: Generated<string>;
  user_id: string;
  hr_zones: HRZonesSettings | null;
  power_zones: PowerZonesSettings | null;
  pace_zones: PaceZonesSettings | null;
  rpe_zones: RPEZonesSettings | null;
  /**
   * E5 social opt-in (per-user). Defaults FALSE — every social
   * surface (leaderboards, cohorts, streak compare) is opt-out so
   * solo lifters aren't enrolled by default. Read by the
   * (future) leaderboard surface to scope queries to consenting
   * users only.
   */
  leaderboard_opt_in: ColumnType<boolean, boolean | undefined, boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type UserSettings = Selectable<UserSettingsTable>;
export type NewUserSettings = Insertable<UserSettingsTable>;
export type UserSettingsUpdate = Updateable<UserSettingsTable>;
