import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  AthleteModuleOverride,
  ClientType,
  Database,
  ModuleRow,
  NewAthleteModuleOverride,
  NewModule,
  NewOrganisationClientTypeModuleDefault,
  NewOrganisationModuleSetting,
  OrganisationClientTypeModuleDefault,
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

  /**
   * Bulk-insert a batch of athlete overrides on first provisioning. We bypass
   * the upsert path because new memberships can't have existing overrides; this
   * also lets us run a single round-trip.
   */
  async insertAthleteOverrides(rows: NewAthleteModuleOverride[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insertInto('athlete_module_overrides').values(rows).execute();
  }

  // ---- per-org, per-client-type module defaults ----

  async listClientTypeDefaults(organisationId: string): Promise<OrganisationClientTypeModuleDefault[]> {
    return this.db
      .selectFrom('organisation_client_type_module_defaults')
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .execute();
  }

  async listClientTypeDefaultsFor(
    organisationId: string,
    clientType: ClientType,
  ): Promise<OrganisationClientTypeModuleDefault[]> {
    return this.db
      .selectFrom('organisation_client_type_module_defaults')
      .where('organisation_id', '=', organisationId)
      .where('client_type', '=', clientType)
      .selectAll()
      .execute();
  }

  async upsertClientTypeDefault(
    data: NewOrganisationClientTypeModuleDefault,
  ): Promise<OrganisationClientTypeModuleDefault> {
    return this.db
      .insertInto('organisation_client_type_module_defaults')
      .values(data)
      .onConflict((oc) =>
        oc
          .columns(['organisation_id', 'client_type', 'module_key'])
          .doUpdateSet({ enabled: data.enabled, updated_at: sql`now()` }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteClientTypeDefault(
    organisationId: string,
    clientType: ClientType,
    moduleKey: string,
  ): Promise<void> {
    await this.db
      .deleteFrom('organisation_client_type_module_defaults')
      .where('organisation_id', '=', organisationId)
      .where('client_type', '=', clientType)
      .where('module_key', '=', moduleKey)
      .execute();
  }
}
