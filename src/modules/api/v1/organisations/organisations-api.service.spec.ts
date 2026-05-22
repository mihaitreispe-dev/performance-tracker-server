/**
 * uuid ships as ESM, and ts-jest chokes on it when the S3Service transitively
 * imports it. We never call the S3 path in this spec, so stub the module out
 * before any imports run.
 */
jest.mock('uuid', () => ({ v4: () => 'stub-uuid' }));

import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';

import { Organisation, OrganisationRole, OrganisationType } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { S3Service } from 'src/modules/s3/s3.service';
import { OrganisationRepository } from 'src/repositories/organisation.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { OrganisationThemeRepository } from 'src/repositories/organisation-theme.repository';

import { OrganisationsApiService } from './organisations-api.service';

const USER = 'user-1';

const reqFor = (id: string = USER) =>
  ({ user: { id } as AuthUser }) as Request & { user: AuthUser };

const makeOrgRow = (over: Partial<Organisation> = {}): Organisation =>
  ({
    id: 'org-1',
    name: 'Test Org',
    slug: 'test-org',
    logo_s3_bucket: null,
    logo_s3_key: null,
    created_by_user_id: USER,
    org_type: OrganisationType.ORGANISATION,
    created_at: new Date('2026-05-20T10:00:00Z'),
    updated_at: new Date('2026-05-20T10:00:00Z'),
    ...over,
  }) as Organisation;

describe('OrganisationsApiService.createOrganisation', () => {
  let service: OrganisationsApiService;
  let orgRepo: jest.Mocked<OrganisationRepository>;
  let membershipRepo: jest.Mocked<OrganisationMembershipRepository>;
  let themeRepo: jest.Mocked<OrganisationThemeRepository>;

  beforeEach(async () => {
    const m: TestingModule = await Test.createTestingModule({
      providers: [
        OrganisationsApiService,
        {
          provide: OrganisationRepository,
          useValue: { findBySlug: jest.fn(), create: jest.fn() },
        },
        {
          provide: OrganisationMembershipRepository,
          useValue: { create: jest.fn() },
        },
        {
          provide: OrganisationThemeRepository,
          useValue: { upsert: jest.fn() },
        },
        {
          // listMyOrganisations needs this for the system-admin shortcut.
          // createOrganisation never reads it, so a stub is enough.
          provide: UserRepository,
          useValue: { findRolesByUserId: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: S3Service,
          useValue: { getSignedUrlGET: jest.fn() },
        },
      ],
    }).compile();

    service = m.get(OrganisationsApiService);
    orgRepo = m.get(OrganisationRepository);
    membershipRepo = m.get(OrganisationMembershipRepository);
    themeRepo = m.get(OrganisationThemeRepository);
  });

  it('rejects when slug is already taken', async () => {
    orgRepo.findBySlug.mockResolvedValue(makeOrgRow());
    await expect(
      service.createOrganisation(reqFor(), { name: 'Test Org' }),
    ).rejects.toThrow(ConflictException);
  });

  it('defaults orgType to "organisation" + seeds clients verbiage', async () => {
    orgRepo.findBySlug.mockResolvedValue(undefined as never);
    orgRepo.create.mockResolvedValue(makeOrgRow());

    await service.createOrganisation(reqFor(), { name: 'FastClub' });

    expect(orgRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ org_type: OrganisationType.ORGANISATION }),
    );
    expect(themeRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        copy_overrides: { athlete: 'client', athletes: 'clients' },
      }),
    );
    expect(membershipRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER, role: OrganisationRole.OWNER }),
    );
  });

  it('honours orgType=individual + seeds athletes verbiage', async () => {
    orgRepo.findBySlug.mockResolvedValue(undefined as never);
    orgRepo.create.mockResolvedValue(makeOrgRow({ org_type: OrganisationType.INDIVIDUAL }));

    await service.createOrganisation(reqFor(), {
      name: "Mihai's Coaching",
      orgType: OrganisationType.INDIVIDUAL,
    });

    expect(orgRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ org_type: OrganisationType.INDIVIDUAL }),
    );
    expect(themeRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        copy_overrides: { athlete: 'athlete', athletes: 'athletes' },
      }),
    );
  });

  it('returns DTO carrying orgType', async () => {
    orgRepo.findBySlug.mockResolvedValue(undefined as never);
    orgRepo.create.mockResolvedValue(makeOrgRow({ org_type: OrganisationType.INDIVIDUAL }));

    const { data } = await service.createOrganisation(reqFor(), {
      name: 'X',
      orgType: OrganisationType.INDIVIDUAL,
    });

    expect(data.orgType).toBe(OrganisationType.INDIVIDUAL);
  });
});
