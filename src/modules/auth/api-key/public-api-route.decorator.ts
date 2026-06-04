import { applyDecorators } from '@nestjs/common';

import { SkipActiveOrg } from '../guards/active-org.guard';
import { DisableJwtAuthGuard } from '../guards/jwt-auth.guard';
import { OptionalApiKey, RequireApiKey } from './api-key.guard';
import { ApiKeyScope } from './api-key.scopes';

/**
 * One decorator for every /v1/public/* route. Bundles the three things a public
 * route always needs:
 *   - @DisableJwtAuthGuard — the request has no user-bearing JWT
 *   - @SkipActiveOrg       — the API key already picks the tenant, X-Organisation-Id
 *                            is irrelevant
 *   - @RequireApiKey(scopes) — turns on ApiKeyAuthGuard with the required scopes
 *
 * Apply per-handler with the scopes the endpoint actually exercises so a misuse
 * (a read key trying to write, say) fails at the guard, not deep in business logic.
 */
export const PublicApiRoute = (...scopes: ApiKeyScope[]) =>
  applyDecorators(DisableJwtAuthGuard(), SkipActiveOrg(), RequireApiKey(...scopes));

/**
 * Same as PublicApiRoute but the API key is OPTIONAL. The guard validates the
 * bearer when one is present and attaches `req.apiKey`; the request still
 * goes through if no bearer is supplied at all. Use for endpoints that
 * support both private-key callers (integrator backends) and public-client
 * callers (browser SPAs using PKCE) — currently just /v1/public/auth/token.
 */
export const OptionalPublicApiRoute = (...scopes: ApiKeyScope[]) =>
  applyDecorators(DisableJwtAuthGuard(), SkipActiveOrg(), OptionalApiKey(...scopes));
