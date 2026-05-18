import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  AthleteModuleOverride,
  Database,
  ModuleRow,
  NewAthleteModuleOverride,
  NewModule,
  NewOrganisationModuleSetting,
  OrganisationModuleSetting,
} from 'src/database/interfaces';

@Injectable()
export class ModuleRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  // ---- catalogue ----

  async listModules(): Promise<ModuleRow[]> {
    return this.db.selectFrom('modules').selectAll().orderBy('sort_order', 'asc').execute();
  }

  async upsertModule(data: NewModule): Promise<void> {
    await this.db
      .insertInto('modules')
      .values(data)
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({
          name: data.name,
          description: data.description,
          default_enabled: data.default_enabled,
          sort_order: data.sort_order,
        }),
      )
      .execute();
  }

  // ---- org settings ----

  async listOrgSettings(organisationId: string): Promise<OrganisationModuleSetting[]> {
    return this.db
      .selectFrom('organisation_module_settings')
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .execute();
  }

  async upsertOrgSetting(data: NewOrganisationModuleSetting): Promise<OrganisationModuleSetting> {
    return this.db
      .insertInto('organisation_module_settings')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['organisation_id', 'module_key']).doUpdateSet({ enabled: data.enabled, updated_at: sql`now()` }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ---- athlete overrides ----

  async listAthleteOverrides(organisationId: string, athleteUserId: string): Promise<AthleteModuleOverride[]> {
    return this.db
      .selectFrom('athlete_module_overrides')
      .where('organisation_id', '=', organisationId)
      .where('athlete_user_id', '=', athleteUserId)
      .selectAll()
      .execute();
  }

  async upsertAthleteOverride(data: NewAthleteModuleOverride): Promise<AthleteModuleOverride> {
    return this.db
      .insertInto('athlete_module_overrides')
      .values(data)
      .onConflict((oc) =>
        oc
          .columns(['organisation_id', 'athlete_user_id', 'module_key'])
          .doUpdateSet({ enabled: data.enabled, updated_at: sql`now()` }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteAthleteOverride(organisationId: string, athleteUserId: string, moduleKey: string): Promise<void> {
    await this.db
      .deleteFrom('athlete_module_overrides')
      .where('organisation_id', '=', organisationId)
      .where('athlete_user_id', '=', athleteUserId)
      .where('module_key', '=', moduleKey)
      .execute();
  }
}
