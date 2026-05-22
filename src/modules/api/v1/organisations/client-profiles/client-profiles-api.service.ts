import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';

import { ClientType, OrganisationRole } from 'src/database/interfaces';
import { isPlatformAdmin } from 'src/lib/util/platform-admin';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { ModuleRepository } from 'src/repositories/module.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { UpdateClientTypeProfileDto } from './request.dto';
import {
  ClientTypeModuleStateDTO,
  ClientTypeProfileDTO,
  ClientTypeProfileResponse,
  ClientTypeProfilesListResponse,
} from './response.dto';

const ADMIN_ROLES = [OrganisationRole.OWNER, OrganisationRole.ADMIN];

/**
 * Admin surface for the per-org default profiles applied to new athletes at
 * provision time. JWT-authed, owner/admin gated.
 *
 *   - GET /client-profiles                — list both general + athlete profiles
 *   - GET /client-profiles/:clientType    — single profile
 *   - PUT /client-profiles/:clientType    — replace the toggle set
 *
 * The store is sparse: only modules where the per-type default differs from the
 * org-wide setting need a row. The response, however, always returns the full
 * catalogue so the UI can render a complete grid without a second fetch.
 */
@Injectable()
export class ClientProfilesApiService {
  constructor(
    private readonly moduleRepo: ModuleRepository,
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly userRepo: UserRepository,
  ) {}

  async listProfiles(
    req: Request & { user: AuthUser },
    orgId: string,
  ): Promise<ClientTypeProfilesListResponse> {
    await this.ensureAdmin(req.user.id, orgId);
    const data = await Promise.all(
      Object.values(ClientType).map((ct) => this.buildProfile(orgId, ct)),
    );
    return { data };
  }

  async getProfile(
    req: Request & { user: AuthUser },
    orgId: string,
    clientType: ClientType,
  ): Promise<ClientTypeProfileResponse> {
    await this.ensureAdmin(req.user.id, orgId);
    return { data: await this.buildProfile(orgId, clientType) };
  }

  async updateProfile(
    req: Request & { user: AuthUser },
    orgId: string,
    clientType: ClientType,
    dto: UpdateClientTypeProfileDto,
  ): Promise<ClientTypeProfileResponse> {
    await this.ensureAdmin(req.user.id, orgId);

    // Validate every moduleKey exists in the catalogue. Saves a sneaky FK
    // error from popping out as a 500.
    const catalogue = await this.moduleRepo.listModules();
    const validKeys = new Set(catalogue.map((m) => m.key));
    for (const t of dto.toggles) {
      if (!validKeys.has(t.moduleKey)) {
        throw new BadRequestException(`Unknown module "${t.moduleKey}"`);
      }
    }

    // Replace-by-rewrite. Cheaper than a diff for the small catalogue size
    // (~10 modules) and keeps the controller idempotent: PUT this body twice,
    // get the same final state.
    const existing = await this.moduleRepo.listClientTypeDefaultsFor(orgId, clientType);
    const incomingKeys = new Set(dto.toggles.map((t) => t.moduleKey));
    for (const row of existing) {
      if (!incomingKeys.has(row.module_key)) {
        await this.moduleRepo.deleteClientTypeDefault(orgId, clientType, row.module_key);
      }
    }
    for (const t of dto.toggles) {
      await this.moduleRepo.upsertClientTypeDefault({
        organisation_id: orgId,
        client_type: clientType,
        module_key: t.moduleKey,
        enabled: t.enabled,
      });
    }

    return { data: await this.buildProfile(orgId, clientType) };
  }

  private async buildProfile(orgId: string, clientType: ClientType): Promise<ClientTypeProfileDTO> {
    const [catalogue, orgSettings, typeDefaults] = await Promise.all([
      this.moduleRepo.listModules(),
      this.moduleRepo.listOrgSettings(orgId),
      this.moduleRepo.listClientTypeDefaultsFor(orgId, clientType),
    ]);

    const orgEnabled = new Map<string, boolean>();
    for (const m of catalogue) orgEnabled.set(m.key, m.default_enabled);
    for (const s of orgSettings) orgEnabled.set(s.module_key, s.enabled);

    const overrides = new Map(typeDefaults.map((d) => [d.module_key, d.enabled]));

    const modules: ClientTypeModuleStateDTO[] = catalogue.map((m) => {
      const orgDefault = orgEnabled.get(m.key) ?? m.default_enabled;
      const overrideValue = overrides.get(m.key);
      const hasOverride = overrideValue !== undefined;
      return {
        moduleKey: m.key,
        moduleName: m.name,
        enabled: hasOverride ? overrideValue : orgDefault,
        orgDefault,
        hasOverride,
      };
    });

    return { clientType, modules };
  }

  private async ensureAdmin(userId: string, orgId: string): Promise<void> {
    const ok = await this.membershipRepo.hasRole(userId, orgId, ADMIN_ROLES);
    if (ok) return;
    if (await isPlatformAdmin(this.userRepo, userId)) return;
    throw new ForbiddenException('Owner or admin role required to manage client profiles');
  }
}
