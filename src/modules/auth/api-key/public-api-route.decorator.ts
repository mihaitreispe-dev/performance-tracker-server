import { applyDecorators } from '@nestjs/common';

import { SkipActiveOrg } from '../guards/active-org.guard';
import { DisableJwtAuthGuard } from '../guards/jwt-auth.guard';
import { RequireApiKey } from './api-key.guard';
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
