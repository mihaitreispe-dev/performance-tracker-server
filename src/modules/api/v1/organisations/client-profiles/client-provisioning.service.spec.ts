import { Test, TestingModule } from '@nestjs/testing';

import { ClientType, ModuleKey } from 'src/database/interfaces';
import { ModuleRepository } from 'src/repositories/module.repository';

import { ClientProvisioningService } from './client-provisioning.service';

/**
 * Coverage focuses on the only thing the caller cares about: which
 * `athlete_module_overrides` rows we end up writing. The logic is:
 *
 *   override row WHEN per-type default differs from org-wide enabled state
 *   nothing       WHEN they match (cheaper to no-op than to write redundancy)
 *   nothing       WHEN module key is unknown to the catalogue
 *   nothing       WHEN repo throws (service swallows + logs)
 */
const ORG = 'org-1';
const USER = 'user-1';

describe('ClientProvisioningService', () => {
  let service: ClientProvisioningService;
  let moduleRepo: jest.Mocked<ModuleRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientProvisioningService,
        {
          provide: ModuleRepository,
          useValue: {
            listModules: jest.fn(),
            listOrgSettings: jest.fn(),
            listClientTypeDefaultsFor: jest.fn(),
            insertAthleteOverrides: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get(ClientProvisioningService);
    moduleRepo = module.get(ModuleRepository);
  });

  it('writes override rows only where the per-type default disagrees with the org default', async () => {
    // Org-wide: WORKOUTS=on (catalogue default), COURSES=off (explicit override)
    moduleRepo.listModules.mockResolvedValue([
      { key: ModuleKey.WORKOUTS, default_enabled: true } as never,
      { key: ModuleKey.COURSES, default_enabled: true } as never,
    ]);
    moduleRepo.listOrgSettings.mockResolvedValue([
      { module_key: ModuleKey.COURSES, enabled: false } as never,
    ]);
    // Per-type for general: WORKOUTS=off (differs from org), COURSES=off (matches → no-op)
    moduleRepo.listClientTypeDefaultsFor.mockResolvedValue([
      { module_key: ModuleKey.WORKOUTS, enabled: false } as never,
      { module_key: ModuleKey.COURSES, enabled: false } as never,
    ]);

    await service.applyClientTypeDefaults({
      organisationId: ORG,
      athleteUserId: USER,
      clientType: ClientType.GENERAL,
    });

    expect(moduleRepo.insertAthleteOverrides).toHaveBeenCalledTimes(1);
    expect(moduleRepo.insertAthleteOverrides).toHaveBeenCalledWith([
      {
        organisation_id: ORG,
        athlete_user_id: USER,
        module_key: ModuleKey.WORKOUTS,
        enabled: false,
      },
    ]);
  });

  it('skips per-type entries for modules missing from the catalogue', async () => {
    moduleRepo.listModules.mockResolvedValue([
      { key: ModuleKey.WORKOUTS, default_enabled: true } as never,
    ]);
    moduleRepo.listOrgSettings.mockResolvedValue([]);
    moduleRepo.listClientTypeDefaultsFor.mockResolvedValue([
      { module_key: 'ghost_module', enabled: true } as never,
    ]);

    await service.applyClientTypeDefaults({
      organisationId: ORG,
      athleteUserId: USER,
      clientType: ClientType.ATHLETE,
    });

    expect(moduleRepo.insertAthleteOverrides).not.toHaveBeenCalled();
  });

  it('is a no-op when no per-type defaults are configured', async () => {
    moduleRepo.listModules.mockResolvedValue([
      { key: ModuleKey.WORKOUTS, default_enabled: true } as never,
    ]);
    moduleRepo.listOrgSettings.mockResolvedValue([]);
    moduleRepo.listClientTypeDefaultsFor.mockResolvedValue([]);

    await service.applyClientTypeDefaults({
      organisationId: ORG,
      athleteUserId: USER,
      clientType: ClientType.ATHLETE,
    });

    expect(moduleRepo.insertAthleteOverrides).not.toHaveBeenCalled();
  });

  it('swallows repository errors (logged, but never thrown)', async () => {
    moduleRepo.listModules.mockRejectedValue(new Error('db gone'));
    await expect(
      service.applyClientTypeDefaults({
        organisationId: ORG,
        athleteUserId: USER,
        clientType: ClientType.GENERAL,
      }),
    ).resolves.toBeUndefined();
    expect(moduleRepo.insertAthleteOverrides).not.toHaveBeenCalled();
  });
});
