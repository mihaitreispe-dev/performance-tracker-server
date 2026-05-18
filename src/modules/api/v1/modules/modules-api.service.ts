import { ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Request } from 'express';
import { ModuleRow, OrganisationRole } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { ModuleRepository } from 'src/repositories/module.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';

import { MODULE_CATALOGUE } from './module-catalogue';
import { SetAthleteOverrideDto, SetOrgModuleDto } from './request.dto';
import {
  ModuleDTO,
  ModulesListResponse,
  ResolvedModuleDTO,
  ResolvedModulesResponse,
} from './response.dto';

const ADMIN_ROLES: OrganisationRole[] = [OrganisationRole.OWNER, OrganisationRole.ADMIN];
const COACH_OR_ABOVE: OrganisationRole[] = [
  OrganisationRole.OWNER,
  OrganisationRole.ADMIN,
  OrganisationRole.COACH,
];

@Injectable()
export class ModulesApiService implements OnModuleInit {
  private readonly logger = new Logger(ModulesApiService.name);

  constructor(
    private readonly moduleRepo: ModuleRepository,
    private readonly membershipRepo: OrganisationMembershipRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    // Seed the catalogue idempotently so adding a module is just a code change.
    for (const entry of MODULE_CATALOGUE) {
      await this.moduleRepo.upsertModule({
        key: entry.key,
        name: entry.name,
        description: entry.description,
        default_enabled: entry.defaultEnabled,
        sort_order: entry.sortOrder,
      });
    }
    this.logger.log(`Seeded ${MODULE_CATALOGUE.length} modules`);
  }

  async listCatalogue(): Promise<ModulesListResponse> {
    const rows = await this.moduleRepo.listModules();
    return { data: rows.map((r) => this.mapToDTO(r)) };
  }

  async resolveModules(
    req: Request & { user: AuthUser },
    organisationId: string,
    athleteId?: string,
  ): Promise<ResolvedModulesResponse> {
    await this.ensureMember(req.user.id, organisationId);

    const [catalogue, orgSettings, athleteOverrides] = await Promise.all([
      this.moduleRepo.listModules(),
      this.moduleRepo.listOrgSettings(organisationId),
      athleteId ? this.moduleRepo.listAthleteOverrides(organisationId, athleteId) : Promise.resolve([]),
    ]);

    const orgByKey = new Map(orgSettings.map((s) => [s.module_key, s.enabled]));
    const athleteByKey = new Map(athleteOverrides.map((o) => [o.module_key, o.enabled]));

    const resolved: ResolvedModuleDTO[] = catalogue.map((m) => {
      if (athleteByKey.has(m.key)) {
        return this.mapToResolved(m, athleteByKey.get(m.key)!, 'athlete');
      }
      if (orgByKey.has(m.key)) {
        return this.mapToResolved(m, orgByKey.get(m.key)!, 'org');
      }
      return this.mapToResolved(m, m.default_enabled, 'default');
    });

    return { data: resolved };
  }

  async setOrgModule(
    req: Request & { user: AuthUser },
    organisationId: string,
    dto: SetOrgModuleDto,
  ): Promise<{ ok: true }> {
    await this.ensureRole(req.user.id, organisationId, ADMIN_ROLES);
    await this.moduleRepo.upsertOrgSetting({
      organisation_id: organisationId,
      module_key: dto.moduleKey,
      enabled: dto.enabled,
    });
    return { ok: true };
  }

  async setAthleteOverride(
    req: Request & { user: AuthUser },
    organisationId: string,
    dto: SetAthleteOverrideDto,
  ): Promise<{ ok: true }> {
    await this.ensureRole(req.user.id, organisationId, COACH_OR_ABOVE);
    await this.moduleRepo.upsertAthleteOverride({
      organisation_id: organisationId,
      athlete_user_id: dto.athleteUserId,
      module_key: dto.moduleKey,
      enabled: dto.enabled,
    });
    return { ok: true };
  }

  async clearAthleteOverride(
    req: Request & { user: AuthUser },
    organisationId: string,
    athleteUserId: string,
    moduleKey: string,
  ): Promise<{ ok: true }> {
    await this.ensureRole(req.user.id, organisationId, COACH_OR_ABOVE);
    await this.moduleRepo.deleteAthleteOverride(organisationId, athleteUserId, moduleKey);
    return { ok: true };
  }

  private async ensureMember(userId: string, organisationId: string): Promise<void> {
    const m = await this.membershipRepo.findByUserAndOrg(userId, organisationId);
    if (!m) throw new ForbiddenException('You are not a member of this organisation');
  }

  private async ensureRole(userId: string, organisationId: string, roles: OrganisationRole[]): Promise<void> {
    const ok = await this.membershipRepo.hasRole(userId, organisationId, roles);
    if (!ok) throw new ForbiddenException('Insufficient permissions in this organisation');
  }

  private mapToDTO(m: ModuleRow): ModuleDTO {
    return {
      key: m.key,
      name: m.name,
      description: m.description,
      defaultEnabled: m.default_enabled,
      sortOrder: m.sort_order,
    };
  }

  private mapToResolved(m: ModuleRow, enabled: boolean, source: 'default' | 'org' | 'athlete'): ResolvedModuleDTO {
    return {
      key: m.key,
      name: m.name,
      description: m.description,
      sortOrder: m.sort_order,
      enabled,
      source,
    };
  }
}
