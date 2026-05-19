import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { OrganisationApiKey } from 'src/database/interfaces';
import { OrganisationApiKeyRepository } from 'src/repositories/organisation-api-key.repository';

import { ApiKeyAuthGuard, RequireApiKey } from './api-key.guard';
import { generateApiKey, hashApiKey } from './api-key.util';

function makeContext(request: Partial<Request>, handler: () => unknown = () => undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request as Request,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
    getHandler: () => handler,
    getClass: () => class C {},
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({}) as never,
    switchToWs: () => ({}) as never,
    getType: () => 'http' as const,
  } as unknown as ExecutionContext;
}

describe('ApiKeyAuthGuard', () => {
  let guard: ApiKeyAuthGuard;
  let repo: jest.Mocked<OrganisationApiKeyRepository>;
  let reflector: Reflector;

  beforeEach(() => {
    repo = {
      findActiveByPrefix: jest.fn(),
      touchLastUsed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OrganisationApiKeyRepository>;
    reflector = new Reflector();
    guard = new ApiKeyAuthGuard(repo, reflector);
  });

  it('passes through routes that do not opt in to API-key auth', async () => {
    const ctx = makeContext({ headers: {} });
    // No metadata on the handler — the route is JWT-authed; we must NOT throw.
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects when an opted-in route has no API key', async () => {
    const handler = () => undefined;
    RequireApiKey('workouts:read')(undefined as never, 'h', { value: handler } as PropertyDescriptor);
    const ctx = makeContext({ headers: {} }, handler);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects malformed keys without touching the DB', async () => {
    const handler = () => undefined;
    RequireApiKey('workouts:read')(undefined as never, 'h', { value: handler } as PropertyDescriptor);
    const ctx = makeContext({ headers: { authorization: 'Bearer not-a-real-key' } }, handler);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(repo.findActiveByPrefix).not.toHaveBeenCalled();
  });

  it('rejects keys whose hash does not match', async () => {
    const handler = () => undefined;
    RequireApiKey('workouts:read')(undefined as never, 'h', { value: handler } as PropertyDescriptor);
    const { fullKey, prefix } = generateApiKey('live');
    const tampered = fullKey.slice(0, -1) + (fullKey.endsWith('A') ? 'B' : 'A');
    repo.findActiveByPrefix.mockResolvedValue({
      id: 'k1',
      organisation_id: 'o1',
      key_prefix: prefix,
      key_hash: await hashApiKey(fullKey),
      scopes: ['workouts:read'],
    } as unknown as OrganisationApiKey);

    const ctx = makeContext({ headers: { 'x-api-key': tampered } }, handler);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the key is missing a required scope', async () => {
    const handler = () => undefined;
    RequireApiKey('workouts:read', 'clients:create')(
      undefined as never,
      'h',
      { value: handler } as PropertyDescriptor,
    );
    const { fullKey, prefix } = generateApiKey('live');
    repo.findActiveByPrefix.mockResolvedValue({
      id: 'k1',
      organisation_id: 'o1',
      key_prefix: prefix,
      key_hash: await hashApiKey(fullKey),
      scopes: ['workouts:read'],
    } as unknown as OrganisationApiKey);

    const ctx = makeContext({ headers: { authorization: `Bearer ${fullKey}` } }, handler);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('attaches apiKey + activeOrg on success, fires touchLastUsed once', async () => {
    const handler = () => undefined;
    RequireApiKey('workouts:read')(undefined as never, 'h', { value: handler } as PropertyDescriptor);
    const { fullKey, prefix } = generateApiKey('live');
    repo.findActiveByPrefix.mockResolvedValue({
      id: 'k1',
      organisation_id: 'org-1',
      key_prefix: prefix,
      key_hash: await hashApiKey(fullKey),
      scopes: ['workouts:read', 'courses:read'],
    } as unknown as OrganisationApiKey);

    const req: Partial<Request> & { apiKey?: unknown; activeOrg?: unknown } = {
      headers: { authorization: `Bearer ${fullKey}` },
    };
    const ctx = makeContext(req, handler);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.apiKey).toMatchObject({
      apiKeyId: 'k1',
      organisationId: 'org-1',
      scopes: ['workouts:read', 'courses:read'],
    });
    expect(req.activeOrg).toMatchObject({ organisationId: 'org-1' });
    expect(repo.touchLastUsed).toHaveBeenCalledWith('k1');
  });
});
