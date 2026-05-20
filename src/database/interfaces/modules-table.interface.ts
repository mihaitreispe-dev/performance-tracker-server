import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum ModuleKey {
  WORKOUTS = 'workouts',
  WORKOUT_PLANS = 'workout_plans',
  WORKOUT_SCHEDULES = 'workout_schedules',
  EXERCISES = 'exercises',
  MOVEMENT_SNACKS = 'movement_snacks',
  COURSES = 'courses',
}

export interface ModulesTable {
  key: string;
  name: string;
  description: string | null;
  default_enabled: boolean;
  sort_order: number;
  created_at: Generated<Timestamp>;
}

export type ModuleRow = Selectable<ModulesTable>;
export type NewModule = Insertable<ModulesTable>;
export type ModuleUpdate = Updateable<ModulesTable>;

export interface OrganisationModuleSettingsTable {
  organisation_id: string;
  module_key: string;
  enabled: boolean;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type OrganisationModuleSetting = Selectable<OrganisationModuleSettingsTable>;
export type NewOrganisationModuleSetting = Insertable<OrganisationModuleSettingsTable>;
export type OrganisationModuleSettingUpdate = Updateable<OrganisationModuleSettingsTable>;

export interface AthleteModuleOverridesTable {
  organisation_id: string;
  athlete_user_id: string;
  module_key: string;
  enabled: boolean;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type AthleteModuleOverride = Selectable<AthleteModuleOverridesTable>;
export type NewAthleteModuleOverride = Insertable<AthleteModuleOverridesTable>;
export type AthleteModuleOverrideUpdate = Updateable<AthleteModuleOverridesTable>;

/**
 * Per-org, per-client-type default module toggles. Applied at provisioning
 * (athlete invite / public client upsert): for every module where this row
 * disagrees with the org-wide setting, a matching `athlete_module_overrides`
 * row is written so the difference sticks even if the org-wide default
 * changes later.
 */
export interface OrganisationClientTypeModuleDefaultsTable {
  organisation_id: string;
  client_type: string;
  module_key: string;
  enabled: boolean;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type OrganisationClientTypeModuleDefault = Selectable<OrganisationClientTypeModuleDefaultsTable>;
export type NewOrganisationClientTypeModuleDefault = Insertable<OrganisationClientTypeModuleDefaultsTable>;
export type OrganisationClientTypeModuleDefaultUpdate = Updateable<OrganisationClientTypeModuleDefaultsTable>;
