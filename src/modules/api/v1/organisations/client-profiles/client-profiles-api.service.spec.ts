import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';

import { ClientType, ModuleKey, OrganisationRole } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { ModuleRepository } from 'src/repositories/module.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';

import { ClientProfilesApiService } from './client-profiles-api.service';

/**
 * Verifies the admin gate, the build-profile shape (effective state +
 * inherits-vs-overrides flags), and replace-by-rewrite semantics on save.
 */
const ORG = 'org-1';
const USER = 'user-1';
const req = { user: { id: USER } as AuthUser } as Request & { user: AuthUser };

describe('ClientProfilesApiService', () => {
  let service: ClientProfilesApiService;
  let moduleRepo: jest.Mocked<ModuleRepository>;
  let membershipRepo: jest.Mocked<OrganisationMembershipRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientProfilesApiService,
        {
          provide: ModuleRepository,
          useValue: {
            listModules: jest.fn(),
            listOrgSettings: jest.fn(),
            listClientTypeDefaultsFor: jest.fn(),
            upsertClientTypeDefault: jest.fn(),
            deleteClientTypeDefault: jest.fn(),
          },
        },
        {
          provide: OrganisationMembershipRepository,
          useValue: { hasRole: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(ClientProfilesApiService);
    moduleRepo = module.get(ModuleRepository);
    membershipRepo = module.get(OrganisationMembershipRepository);
  });

  it('rejects non-admins with 403', async () => {
    membershipRepo.hasRole.mockResolvedValue(false);
    await expect(service.listProfiles(req, ORG)).rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipRepo.hasRole).toHaveBeenCalledWith(USER, ORG, [
      OrganisationRole.OWNER,
      OrganisationRole.ADMIN,
    ]);
  });

  describe('buildProfile (via listProfiles)', () => {
    beforeEach(() => {
      membershipRepo.hasRole.mockResolvedValue(true);
      moduleRepo.listModules.mockResolvedValue([
        { key: ModuleKey.WORKOUTS, name: 'Workouts', default_enabled: true } as never,
        { key: ModuleKey.COURSES, name: 'Courses', default_enabled: true } as never,
      ]);
      moduleRepo.listOrgSettings.mockResolvedValue([
        { module_key: ModuleKey.COURSES, enabled: false } as never,
      ]);
    });

    it('marks overrides vs inherited correctly', async () => {
      moduleRepo.listClientTypeDefaultsFor.mockImplementation(async (_org, ct) => {
        if (ct === ClientType.ATHLETE) {
          return [{ module_key: ModuleKey.WORKOUTS, enabled: false } as never];
        }
        return [];
      });

      const res = await service.listProfiles(req, ORG);

      const athleteProfile = res.data.find((p) => p.clientType === ClientType.ATHLETE);
      expect(athleteProfile).toBeDefined();
      const workoutsForAthlete = athleteProfile!.modules.find(
        (m) => m.moduleKey === ModuleKey.WORKOUTS,
      );
      expect(workoutsForAthlete).toMatchObject({
        enabled: false,
        orgDefault: true,
        hasOverride: true,
      });
      // Courses has no per-type override → falls back to org-wide (off).
      const coursesForAthlete = athleteProfile!.modules.find(
        (m) => m.moduleKey === ModuleKey.COURSES,
      );
      expect(coursesForAthlete).toMatchObject({
        enabled: false,
        orgDefault: false,
        hasOverride: false,
      });
    });

    it('returns both client_types', async () => {
      moduleRepo.listClientTypeDefaultsFor.mockResolvedValue([]);
      const res = await service.listProfiles(req, ORG);
      expect(res.data.map((p) => p.clientType).sort()).toEqual([
        ClientType.ATHLETE,
        ClientType.GENERAL,
      ]);
    });
  });

  describe('updateProfile', () => {
    beforeEach(() => {
      membershipRepo.hasRole.mockResolvedValue(true);
      moduleRepo.listModules.mockResolvedValue([
        { key: ModuleKey.WORKOUTS, name: 'Workouts', default_enabled: true } as never,
        { key: ModuleKey.COURSES, name: 'Courses', default_enabled: true } as never,
      ]);
      moduleRepo.listOrgSettings.mockResolvedValue([]);
    });

    it('rejects unknown module keys', async () => {
      await expect(
        service.updateProfile(req, ORG, ClientType.GENERAL, {
          toggles: [{ moduleKey: 'fake_module', enabled: true }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deletes per-type rows for modules absent from the new body', async () => {
      // Existing: WORKOUTS + COURSES. New body: only WORKOUTS → COURSES should be deleted.
      moduleRepo.listClientTypeDefaultsFor.mockResolvedValue([
        { module_key: ModuleKey.WORKOUTS, enabled: false } as never,
        { module_key: ModuleKey.COURSES, enabled: true } as never,
      ]);

      await service.updateProfile(req, ORG, ClientType.GENERAL, {
        toggles: [{ moduleKey: ModuleKey.WORKOUTS, enabled: false }],
      });

      expect(moduleRepo.deleteClientTypeDefault).toHaveBeenCalledWith(
        ORG,
        ClientType.GENERAL,
        ModuleKey.COURSES,
      );
      expect(moduleRepo.upsertClientTypeDefault).toHaveBeenCalledWith(
        expect.objectContaining({
          module_key: ModuleKey.WORKOUTS,
          enabled: false,
          client_type: ClientType.GENERAL,
        }),
      );
    });
  });
});
