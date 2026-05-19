import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { OrganisationApiUsageRepository } from 'src/repositories/organisation-api-usage.repository';

import type { ApiKeyContext } from './api-key.guard';

/**
 * Logs one row to organisation_api_usage for every authenticated /v1/public/* call.
 *
 *   - Reads `req.apiKey` populated by ApiKeyAuthGuard. Routes without a key are
 *     ignored so this interceptor is safe to register globally.
 *   - Uses the route template (not the raw URL) as `endpoint` — keeps the keyset
 *     small enough to chart and means rolled-up counts make sense.
 *   - Writes are fire-and-forget: a DB blip in the metering pipeline must never
 *     break a customer's request.
 */
@Injectable()
export class ApiKeyUsageInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ApiKeyUsageInterceptor.name);

  constructor(private readonly usageRepo: OrganisationApiUsageRepository) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const req = context.switchToHttp().getRequest<Request & { apiKey?: ApiKeyContext }>();
    const apiKey = req.apiKey;
    if (!apiKey) {
      return next.handle();
    }

    const endpoint = resolveEndpoint(req);
    const method = req.method.toUpperCase();
    const log = (statusCode: number) => {
      const responseMs = Date.now() - startedAt;
      // Fire-and-forget. We intentionally do not `await` — the response has already
      // been streamed; we just want a side-effect row for the metering pipeline.
      void this.usageRepo
        .insert({
          organisation_id: apiKey.organisationId,
          api_key_id: apiKey.apiKeyId,
          endpoint,
          method,
          status_code: statusCode,
          response_ms: responseMs,
        })
        .catch((err) => {
          this.logger.warn(`Failed to log API usage for ${endpoint}: ${(err as Error).message}`);
        });
    };

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          log(res.statusCode || 200);
        },
        error: (err: unknown) => {
          const status =
            err instanceof HttpException ? err.getStatus() : 500;
          log(status);
        },
      }),
    );
  }
}

/**
 * Prefer the Express route template (e.g. "/v1/public/workouts/:id") over the
 * concrete URL so the metering keyset stays bounded and aggregations are meaningful.
 * Falls back to the raw path if no route metadata is present (shouldn't happen in
 * Nest, but keep the path lightweight).
 */
function resolveEndpoint(req: Request): string {
  const baseUrl = req.baseUrl ?? '';
  const routePath = (req.route as { path?: string } | undefined)?.path;
  if (routePath) {
    return `${baseUrl}${routePath}`.replace(/\/{2,}/g, '/');
  }
  // Strip the query string in the fallback.
  const idx = req.originalUrl.indexOf('?');
  return idx >= 0 ? req.originalUrl.slice(0, idx) : req.originalUrl;
}
