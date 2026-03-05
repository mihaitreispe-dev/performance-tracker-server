import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed in the time window */
  limit: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Optional: Custom key generator (defaults to IP-based) */
  keyGenerator?: (req: Request) => string;
  /** Optional: Error message when rate limited */
  message?: string;
}

const RATE_LIMIT_KEY = 'RATE_LIMIT_CONFIG';

/**
 * Decorator to apply rate limiting to a route or controller
 * @param config Rate limit configuration
 */
export const RateLimit = (config: RateLimitConfig) => SetMetadata(RATE_LIMIT_KEY, config);

/**
 * Common rate limit presets
 */
export const RateLimitPresets = {
  /** Auth endpoints: 5 requests per minute */
  AUTH: { limit: 5, windowSeconds: 60, message: 'Too many authentication attempts. Please try again later.' },
  /** Login specifically: 10 requests per 15 minutes */
  LOGIN: { limit: 10, windowSeconds: 900, message: 'Too many login attempts. Please try again in 15 minutes.' },
  /** File upload: 10 requests per minute */
  FILE_UPLOAD: { limit: 10, windowSeconds: 60, message: 'Too many upload attempts. Please wait before uploading more files.' },
  /** Export: 5 requests per 5 minutes */
  EXPORT: { limit: 5, windowSeconds: 300, message: 'Too many export requests. Please wait before requesting another export.' },
  /** General API: 100 requests per minute */
  GENERAL: { limit: 100, windowSeconds: 60, message: 'Rate limit exceeded. Please slow down your requests.' },
} as const;

/**
 * In-memory rate limit store
 * For production, consider using Redis for distributed rate limiting
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean up every minute

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const config = this.reflector.getAllAndOverride<RateLimitConfig | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No rate limit configured, allow request
    if (!config) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const key = this.generateKey(request, config);
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    // Reset if window has expired
    if (!entry || entry.resetAt <= now) {
      entry = {
        count: 0,
        resetAt: now + config.windowSeconds * 1000,
      };
    }

    entry.count++;
    rateLimitStore.set(key, entry);

    // Check if limit exceeded
    if (entry.count > config.limit) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: config.message || 'Rate limit exceeded. Please try again later.',
          retryAfter: retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Add rate limit headers to response
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-RateLimit-Limit', config.limit);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, config.limit - entry.count));
    response.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    return true;
  }

  private generateKey(request: Request, config: RateLimitConfig): string {
    if (config.keyGenerator) {
      return config.keyGenerator(request);
    }

    // Default: IP + route path
    const ip = this.getClientIp(request);
    const route = request.route?.path || request.path;
    return `${ip}:${route}`;
  }

  private getClientIp(request: Request): string {
    // Check for forwarded headers (common in reverse proxy setups)
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',');
      return ips[0].trim();
    }

    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    return request.ip || request.socket?.remoteAddress || 'unknown';
  }
}
