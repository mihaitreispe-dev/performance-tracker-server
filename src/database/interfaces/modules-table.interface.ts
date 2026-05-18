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
