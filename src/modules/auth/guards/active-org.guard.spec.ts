import { BadRequestException, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { OrganisationMembership, OrganisationRole, UserRole } from '../../../database/interfaces';
import { OrganisationMembershipRepository } from '../../../repositories/organisation-membership.repository';
import { UserRepository } from '../../../repositories/user.repository';
import { ACTIVE_ORG_HEADER, ActiveOrgGuard, SkipActiveOrg } from './active-org.guard';

describe('ActiveOrgGuard', () => {
  let guard: ActiveOrgGuard;
  let membershipRepo: jest.Mocked<OrganisationMembershipRepository>;
  let userRepo: jest.Mocked<UserRepository>;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    membershipRepo = {
      findByUserAndOrg: jest.fn(),
    } as unknown as jest.Mocked<OrganisationMembershipRepository>;
    userRepo = {
      // Default to no roles; admin-path tests override per-case.
      findRolesByUserId: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<UserRepository>;
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
    guard = new ActiveOrgGuard(membershipRepo, userRepo, reflector);
  });

  function makeContext(opts: { user?: { id: string }; headers?: Record<string, unknown> }): {
    context: ExecutionContext;
    request: { user?: { id: string }; headers: Record<string, unknown>; activeOrg?: unknown };
  } {
    const request = {
      user: opts.user,
      headers: opts.headers ?? {},
    } as { user?: { id: string }; headers: Record<string, unknown>; activeOrg?: unknown };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
    return { context, request };
  }

  it('lets requests through when @SkipActiveOrg() is applied', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const { context } = makeContext({ user: { id: 'u1' }, headers: {} });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(membershipRepo.findByUserAndOrg).not.toHaveBeenCalled();
  });

  it('lets unauthenticated requests through (they will be stopped by JwtAuthGuard upstream)', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const { context } = makeContext({ user: undefined, headers: {} });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(membershipRepo.findByUserAndOrg).not.toHaveBeenCalled();
  });

  it('rejects when the X-Organisation-Id header is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const { context } = makeContext({ user: { id: 'u1' }, headers: {} });
    await expect(guard.canActivate(context)).rejects.toThrow(BadRequestException);
  });

  it('rejects when the user is not a member of the supplied org', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    membershipRepo.findByUserAndOrg.mockResolvedValue(undefined);
    const { context } = makeContext({
      user: { id: 'u1' },
      headers: { [ACTIVE_ORG_HEADER]: 'org-1' },
    });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('attaches activeOrg to the request when membership is valid', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const membership: OrganisationMembership = {
      id: 'm1',
      organisation_id: 'org-1',
      user_id: 'u1',
      role: OrganisationRole.COACH,
      invited_by_user_id: null,
      invited_at: new Date(),
      accepted_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    } as unknown as OrganisationMembership;
    membershipRepo.findByUserAndOrg.mockResolvedValue(membership);

    const { context, request } = makeContext({
      user: { id: 'u1' },
      headers: { [ACTIVE_ORG_HEADER]: 'org-1' },
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.activeOrg).toEqual({ organisationId: 'org-1', role: OrganisationRole.COACH });
  });

  it('handles array-style header values (Node coerces duplicate headers to string[])', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    membershipRepo.findByUserAndOrg.mockResolvedValue({
      id: 'm1',
      organisation_id: 'org-1',
      user_id: 'u1',
      role: OrganisationRole.ATHLETE,
    } as unknown as OrganisationMembership);
    const { context, request } = makeContext({
      user: { id: 'u1' },
      headers: { [ACTIVE_ORG_HEADER]: ['org-1', 'org-2'] },
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.activeOrg).toEqual({ organisationId: 'org-1', role: OrganisationRole.ATHLETE });
  });

  it('lets a system admin (UserRole.ADMIN) into an org they are not a member of with synthesised admin role', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    membershipRepo.findByUserAndOrg.mockResolvedValue(undefined);
    userRepo.findRolesByUserId.mockResolvedValue([UserRole.ADMIN]);

    const { context, request } = makeContext({
      user: { id: 'platform-admin' },
      headers: { [ACTIVE_ORG_HEADER]: 'org-they-do-not-belong-to' },
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.activeOrg).toEqual({
      organisationId: 'org-they-do-not-belong-to',
      role: OrganisationRole.ADMIN,
    });
  });

  it('still 403s a non-admin non-member', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    membershipRepo.findByUserAndOrg.mockResolvedValue(undefined);
    userRepo.findRolesByUserId.mockResolvedValue([UserRole.USER]);

    const { context } = makeContext({
      user: { id: 'regular' },
      headers: { [ACTIVE_ORG_HEADER]: 'org-1' },
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('SkipActiveOrg() decorator is a callable that returns a metadata setter', () => {
    expect(typeof SkipActiveOrg).toBe('function');
    const decorator = SkipActiveOrg();
    expect(typeof decorator).toBe('function');
  });
});
