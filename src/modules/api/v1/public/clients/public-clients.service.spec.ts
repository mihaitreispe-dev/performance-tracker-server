import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';

import {
  OrganisationMembership,
  OrganisationRole,
  User,
  UserRole,
} from 'src/database/interfaces';
import { ClientProvisioningService } from 'src/modules/api/v1/organisations/client-profiles/client-provisioning.service';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { PublicClientsService } from './public-clients.service';

/**
 * Test-only nestjs-kysely token. The service injects via @InjectKysely(); during a
 * unit test we never want a real Kysely client, but the DI tree still needs a value
 * to satisfy the dependency. The list/getById tests don't touch it at all; the
 * upsert path would need full transaction mocking — covered by the curl smoke test
 * after migrations apply, not here.
 */
const KYSELY_TOKEN = KYSELY_MODULE_CONNECTION_TOKEN();

const ORG = 'org-1';
const OTHER_ORG = 'org-other';

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'u-1',
  firebase_uid: 'pending:abc',
  email: 'client@example.com',
  display_name: 'Client',
  first_name: null,
  last_name: null,
  picture_s3_bucket: null,
  picture_s3_key: null,
  provider: 'pending',
  roles: [UserRole.USER],
  fcm_tokens: [],
  created_at: new Date('2026-05-19T10:00:00Z') as never,
  updated_at: new Date('2026-05-19T10:00:00Z') as never,
  last_sign_in_at: null,
  ...overrides,
});

const makeMembership = (overrides: Partial<OrganisationMembership> = {}): OrganisationMembership =>
  ({
    id: 'm-1',
    organisation_id: ORG,
    user_id: 'u-1',
    role: OrganisationRole.ATHLETE,
    invited_by_user_id: null,
    invitation_message: null,
    metadata: {},
    invited_at: new Date('2026-05-19T10:00:00Z'),
    accepted_at: new Date('2026-05-19T10:00:00Z'),
    created_at: new Date('2026-05-19T10:00:00Z'),
    updated_at: new Date('2026-05-19T10:00:00Z'),
    ...overrides,
  }) as unknown as OrganisationMembership;

describe('PublicClientsService', () => {
  let service: PublicClientsService;
  let userRepo: jest.Mocked<UserRepository>;
  let membershipRepo: jest.Mocked<OrganisationMembershipRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicClientsService,
        { provide: KYSELY_TOKEN, useValue: {} },
        {
          provide: UserRepository,
          useValue: {
            findByIds: jest.fn().mockResolvedValue([]),
            findById: jest.fn(),
            findByEmail: jest.fn(),
          },
        },
        {
          provide: OrganisationMembershipRepository,
          useValue: {
            findByUserAndOrg: jest.fn(),
            listByOrgWithRole: jest.fn(),
          },
        },
        {
          provide: ClientProvisioningService,
          useValue: { applyClientTypeDefaults: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(PublicClientsService);
    userRepo = module.get(UserRepository);
    membershipRepo = module.get(OrganisationMembershipRepository);
  });

  describe('list', () => {
    it('returns paginated DTOs joined to user rows', async () => {
      const memberships = [makeMembership({ id: 'm-1', user_id: 'u-1' })];
      membershipRepo.listByOrgWithRole.mockResolvedValue({ rows: memberships, totalCount: 1 });
      userRepo.findByIds.mockResolvedValue([makeUser({ id: 'u-1', email: 'a@b.com' })]);

      const res = await service.list(ORG, { offset: 0, limit: 50 });

      expect(res.meta).toEqual({ totalCount: 1, offset: 0, limit: 50 });
      expect(res.data).toHaveLength(1);
      expect(res.data[0]).toMatchObject({ id: 'u-1', email: 'a@b.com', pendingClaim: true });
      expect(res.data[0].membership).toMatchObject({ id: 'm-1', role: OrganisationRole.ATHLETE });
    });

    it('passes the metadata equality filter through to the repo', async () => {
      membershipRepo.listByOrgWithRole.mockResolvedValue({ rows: [], totalCount: 0 });

      await service.list(ORG, { offset: 0, limit: 50, metadata: 'crmId=abc123,plan=pro' });

      expect(membershipRepo.listByOrgWithRole).toHaveBeenCalledWith(
        expect.objectContaining({
          organisationId: ORG,
          role: OrganisationRole.ATHLETE,
          metadataMatch: { crmId: 'abc123', plan: 'pro' },
        }),
      );
    });

    it('omits the metadata filter when the query parameter is missing', async () => {
      membershipRepo.listByOrgWithRole.mockResolvedValue({ rows: [], totalCount: 0 });

      await service.list(ORG, { offset: 0, limit: 50 });

      expect(membershipRepo.listByOrgWithRole).toHaveBeenCalledWith(
        expect.objectContaining({ metadataMatch: undefined }),
      );
    });

    it('drops rows whose user is missing without throwing (membership orphans)', async () => {
      membershipRepo.listByOrgWithRole.mockResolvedValue({
        rows: [makeMembership({ user_id: 'u-1' }), makeMembership({ id: 'm-2', user_id: 'u-orphan' })],
        totalCount: 2,
      });
      userRepo.findByIds.mockResolvedValue([makeUser({ id: 'u-1' })]); // only one of two

      const res = await service.list(ORG, { offset: 0, limit: 50 });

      expect(res.data).toHaveLength(1);
      expect(res.data[0].id).toBe('u-1');
      // totalCount reflects the DB count regardless of orphan filtering.
      expect(res.meta.totalCount).toBe(2);
    });
  });

  describe('getById', () => {
    it('returns the client when membership is in this org and athlete-roled', async () => {
      membershipRepo.findByUserAndOrg.mockResolvedValue(makeMembership());
      userRepo.findById.mockResolvedValue(makeUser());

      const res = await service.getById(ORG, 'u-1');

      expect(res.data.id).toBe('u-1');
      expect(membershipRepo.findByUserAndOrg).toHaveBeenCalledWith('u-1', ORG);
    });

    it('404s when there is no membership in this org (tenant isolation)', async () => {
      membershipRepo.findByUserAndOrg.mockResolvedValue(undefined as never);

      await expect(service.getById(OTHER_ORG, 'u-1')).rejects.toThrow(NotFoundException);
    });

    it('404s when the membership exists but role is not athlete', async () => {
      membershipRepo.findByUserAndOrg.mockResolvedValue(
        makeMembership({ role: OrganisationRole.COACH }),
      );

      await expect(service.getById(ORG, 'u-1')).rejects.toThrow(NotFoundException);
    });

    it('404s when membership exists but user row is missing', async () => {
      membershipRepo.findByUserAndOrg.mockResolvedValue(makeMembership());
      userRepo.findById.mockResolvedValue(undefined as never);

      await expect(service.getById(ORG, 'u-1')).rejects.toThrow(NotFoundException);
    });
  });
});
