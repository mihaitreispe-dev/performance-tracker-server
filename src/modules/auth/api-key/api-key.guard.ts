import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { OrganisationRole } from 'src/database/interfaces';
import { OrganisationApiKeyRepository } from 'src/repositories/organisation-api-key.repository';

import type { ActiveOrgContext } from '../guards/active-org.guard';
import { ApiKeyScope } from './api-key.scopes';
import { parseApiKey, verifyApiKey } from './api-key.util';

const REQUIRED_SCOPES_KEY = 'API_KEY_REQUIRED_SCOPES';

/**
 * Mark a route as requiring an API key. The decorator both gates the guard (so
 * routes without it stay JWT-only) and declares which scopes the key must hold.
 * Multiple scopes form an AND — pass them all to one decorator call.
 */
export const RequireApiKey = (...scopes: ApiKeyScope[]) =>
  SetMetadata(REQUIRED_SCOPES_KEY, scopes);

export interface ApiKeyContext {
  apiKeyId: string;
  organisationId: string;
  scopes: ApiKeyScope[];
}

/**
 * Authenticates incoming /v1/public/* requests against an API key.
 *
 * Bypasses the JWT + ActiveOrg guard pair entirely: the key proves both *who*
 * (the org) and *what they can do* (the scopes). Attaches:
 *   req.apiKey      — full key context (id, org, scopes)
 *   req.activeOrg   — same shape used by tenant-scoped controllers, role='service'
 *
 * Routes that don't declare @RequireApiKey() pass through unchanged so this guard
 * can be registered globally without breaking JWT-authenticated routes.
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly apiKeyRepo: OrganisationApiKeyRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredScopes = this.reflector.getAllAndOverride<ApiKeyScope[] | undefined>(
      REQUIRED_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredScopes) {
      // Route doesn't opt in to API-key auth — let other guards (JWT) handle it.
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const candidate = extractApiKey(request);
    if (!candidate) {
      throw new UnauthorizedException('Missing API key — pass Authorization: Bearer sz_live_... or X-API-Key');
    }

    const parsed = parseApiKey(candidate);
    if (!parsed) {
      throw new UnauthorizedException('Malformed API key');
    }

    const row = await this.apiKeyRepo.findActiveByPrefix(parsed.prefix);
    if (!row) {
      throw new UnauthorizedException('Invalid API key');
    }
    const ok = await verifyApiKey(candidate, row.key_hash);
    if (!ok) {
      throw new UnauthorizedException('Invalid API key');
    }

    const keyScopes = row.scopes as ApiKeyScope[];
    const missing = requiredScopes.filter((s) => !keyScopes.includes(s));
    if (missing.length > 0) {
      throw new ForbiddenException(`API key is missing required scope(s): ${missing.join(', ')}`);
    }

    // Debounced touch — fire-and-forget so we never block the request.
    void this.apiKeyRepo.touchLastUsed(row.id).catch(() => undefined);

    const apiKey: ApiKeyContext = {
      apiKeyId: row.id,
      organisationId: row.organisation_id,
      scopes: keyScopes,
    };
    const activeOrg: ActiveOrgContext = {
      organisationId: row.organisation_id,
      // Synthetic role for service callers — distinct from real memberships so
      // role-based UI checks don't accidentally elevate API consumers.
      role: 'service' as unknown as OrganisationRole,
    };

    (request as Request & { apiKey?: ApiKeyContext; activeOrg?: ActiveOrgContext }).apiKey = apiKey;
    (request as Request & { activeOrg?: ActiveOrgContext }).activeOrg = activeOrg;

    return true;
  }
}

function extractApiKey(req: Request): string | null {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string') {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  const raw = req.headers['x-api-key'];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && raw[0]) return String(raw[0]).trim();
  return null;
}
