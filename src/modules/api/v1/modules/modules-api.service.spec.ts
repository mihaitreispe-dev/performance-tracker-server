import { ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

import {
  AthleteModuleOverride,
  ModuleKey,
  ModuleRow,
  OrganisationMembership,
  OrganisationModuleSetting,
  OrganisationRole,
} from '../../../../database/interfaces';
import { ModuleRepository } from '../../../../repositories/module.repository';
import { OrganisationMembershipRepository } from '../../../../repositories/organisation-membership.repository';
import { AuthUser } from '../../../auth/types/authenticated-user';
import { ModulesApiService } from './modules-api.service';

describe('ModulesApiService.resolveModules', () => {
  let service: ModulesApiService;
  let moduleRepo: jest.Mocked<ModuleRepository>;
  let membershipRepo: jest.Mocked<OrganisationMembershipRepository>;

  const orgId = 'org-1';
  const athleteId = 'athlete-1';
  const mockUser: AuthUser = { id: 'user-1' };

  const catalogue: ModuleRow[] = [
    {
      key: ModuleKey.WORKOUTS,
      name: 'Workouts',
      description: 'Workouts module',
      default_enabled: true,
      sort_order: 10,
      created_at: new Date(),
    } as unknown as ModuleRow,
    {
      key: ModuleKey.MOVEMENT_SNACKS,
      name: 'Movement Snacks',
      description: null,
      default_enabled: false,
      sort_order: 50,
      created_at: new Date(),
    } as unknown as ModuleRow,
    {
      key: ModuleKey.COURSES,
      name: 'Courses',
      description: null,
      default_enabled: true,
      sort_order: 60,
      created_at: new Date(),
    } as unknown as ModuleRow,
  ];

  function makeRequest(): Request & { user: AuthUser } {
    return { user: mockUser } as Request & { user: AuthUser };
  }

  beforeEach(() => {
    moduleRepo = {
      listModules: jest.fn().mockResolvedValue(catalogue),
      listOrgSettings: jest.fn().mockResolvedValue([]),
      listAthleteOverrides: jest.fn().mockResolvedValue([]),
      upsertModule: jest.fn(),
      upsertOrgSetting: jest.fn(),
      upsertAthleteOverride: jest.fn(),
      deleteAthleteOverride: jest.fn(),
    } as unknown as jest.Mocked<ModuleRepository>;

    membershipRepo = {
      findByUserAndOrg: jest.fn().mockResolvedValue({
        id: 'm1',
        organisation_id: orgId,
        user_id: mockUser.id,
        role: OrganisationRole.COACH,
      } as OrganisationMembership),
      hasRole: jest.fn(),
    } as unknown as jest.Mocked<OrganisationMembershipRepository>;

    service = new ModulesApiService(moduleRepo, membershipRepo);
  });

  it('rejects callers who are not members of the organisation', async () => {
    membershipRepo.findByUserAndOrg.mockResolvedValue(undefined);
    await expect(service.resolveModules(makeRequest(), orgId)).rejects.toThrow(ForbiddenException);
  });

  it('returns catalogue defaults when no org or athlete overrides exist', async () => {
    const { data } = await service.resolveModules(makeRequest(), orgId);
    expect(data).toHaveLength(3);
    const workouts = data.find((m) => m.key === ModuleKey.WORKOUTS);
    expect(workouts).toMatchObject({ enabled: true, source: 'default' });
    const snacks = data.find((m) => m.key === ModuleKey.MOVEMENT_SNACKS);
    expect(snacks).toMatchObject({ enabled: false, source: 'default' });
  });

  it('applies org-level settings on top of catalogue defaults', async () => {
    moduleRepo.listOrgSettings.mockResolvedValue([
      {
        organisation_id: orgId,
        module_key: ModuleKey.MOVEMENT_SNACKS,
        enabled: true,
      } as OrganisationModuleSetting,
      {
        organisation_id: orgId,
        module_key: ModuleKey.WORKOUTS,
        enabled: false,
      } as OrganisationModuleSetting,
    ]);

    const { data } = await service.resolveModules(makeRequest(), orgId);
    expect(data.find((m) => m.key === ModuleKey.WORKOUTS)).toMatchObject({
      enabled: false,
      source: 'org',
    });
    expect(data.find((m) => m.key === ModuleKey.MOVEMENT_SNACKS)).toMatchObject({
      enabled: true,
      source: 'org',
    });
    // Courses has no org setting — stays at catalogue default.
    expect(data.find((m) => m.key === ModuleKey.COURSES)).toMatchObject({
      enabled: true,
      source: 'default',
    });
  });

  it('applies athlete overrides on top of org settings (athlete > org > default precedence)', async () => {
    moduleRepo.listOrgSettings.mockResolvedValue([
      {
        organisation_id: orgId,
        module_key: ModuleKey.MOVEMENT_SNACKS,
        enabled: true,
      } as OrganisationModuleSetting,
    ]);
    moduleRepo.listAthleteOverrides.mockResolvedValue([
      {
        organisation_id: orgId,
        athlete_user_id: athleteId,
        module_key: ModuleKey.MOVEMENT_SNACKS,
        enabled: false,
      } as AthleteModuleOverride,
      {
        organisation_id: orgId,
        athlete_user_id: athleteId,
        module_key: ModuleKey.COURSES,
        enabled: false,
      } as AthleteModuleOverride,
    ]);

    const { data } = await service.resolveModules(makeRequest(), orgId, athleteId);

    // Athlete override beats org setting.
    expect(data.find((m) => m.key === ModuleKey.MOVEMENT_SNACKS)).toMatchObject({
      enabled: false,
      source: 'athlete',
    });
    // Athlete override beats catalogue default.
    expect(data.find((m) => m.key === ModuleKey.COURSES)).toMatchObject({
      enabled: false,
      source: 'athlete',
    });
    // No override + no org setting -> default.
    expect(data.find((m) => m.key === ModuleKey.WORKOUTS)).toMatchObject({
      enabled: true,
      source: 'default',
    });
  });

  it('does not consult athlete overrides when no athleteId is supplied', async () => {
    moduleRepo.listAthleteOverrides.mockResolvedValue([
      {
        organisation_id: orgId,
        athlete_user_id: athleteId,
        module_key: ModuleKey.WORKOUTS,
        enabled: false,
      } as AthleteModuleOverride,
    ]);

    const { data } = await service.resolveModules(makeRequest(), orgId);
    expect(moduleRepo.listAthleteOverrides).not.toHaveBeenCalled();
    expect(data.find((m) => m.key === ModuleKey.WORKOUTS)).toMatchObject({ source: 'default' });
  });
});
