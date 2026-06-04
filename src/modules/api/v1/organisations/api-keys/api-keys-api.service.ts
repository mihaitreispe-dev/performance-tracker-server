import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';

import { OrganisationApiKey, OrganisationRole } from 'src/database/interfaces';
import { isPlatformAdmin } from 'src/lib/util/platform-admin';
import {
  generateApiKey,
  hashApiKey,
} from 'src/modules/auth/api-key/api-key.util';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { OrganisationApiKeyRepository } from 'src/repositories/organisation-api-key.repository';
import { OrganisationApiUsageRepository } from 'src/repositories/organisation-api-usage.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { CreateApiKeyDto } from './request.dto';
import {
  ApiKeyDTO,
  ApiKeyListResponse,
  ApiKeyResponse,
  ApiKeyUsageDailyDTO,
  ApiKeyUsageResponse,
  CreatedApiKeyDTO,
  CreatedApiKeyResponse,
} from './response.dto';

const ADMIN_ROLES: OrganisationRole[] = [OrganisationRole.OWNER, OrganisationRole.ADMIN];

@Injectable()
export class ApiKeysApiService {
  constructor(
    private readonly apiKeyRepo: OrganisationApiKeyRepository,
    private readonly usageRepo: OrganisationApiUsageRepository,
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly userRepo: UserRepository,
  ) {}

  async create(
    req: Request & { user: AuthUser },
    orgId: string,
    dto: CreateApiKeyDto,
  ): Promise<CreatedApiKeyResponse> {
    await this.ensureAdmin(req.user.id, orgId);

    const { fullKey, prefix } = generateApiKey(dto.band);
    const keyHash = await hashApiKey(fullKey);

    const row = await this.apiKeyRepo.create({
      organisation_id: orgId,
      name: dto.name.trim(),
      key_prefix: prefix,
      key_hash: keyHash,
      scopes: dto.scopes,
      redirect_uris: dto.redirectUris ?? [],
      is_public_client: dto.isPublicClient ?? false,
      expires_at: dto.expiresAt ? new Date(dto.expiresAt) : null,
      created_by_user_id: req.user.id,
    });

    return { data: { ...this.mapToDTO(row), fullKey } satisfies CreatedApiKeyDTO };
  }

  async list(req: Request & { user: AuthUser }, orgId: string): Promise<ApiKeyListResponse> {
    await this.ensureAdmin(req.user.id, orgId);
    const rows = await this.apiKeyRepo.listByOrganisation(orgId);
    return { data: rows.map((r) => this.mapToDTO(r)) };
  }

  async revoke(
    req: Request & { user: AuthUser },
    orgId: string,
    keyId: string,
  ): Promise<ApiKeyResponse> {
    await this.ensureAdmin(req.user.id, orgId);
    const existing = await this.apiKeyRepo.findById(keyId);
    if (!existing || existing.organisation_id !== orgId) {
      throw new NotFoundException('API key not found');
    }
    if (existing.revoked_at) {
      // Already revoked — idempotent, just return the row.
      return { data: this.mapToDTO(existing) };
    }
    const revoked = await this.apiKeyRepo.revoke(keyId);
    return { data: this.mapToDTO(revoked) };
  }

  /**
   * Returns daily usage points for the last `days` days. Pulled from the rollup
   * table; the current day is included even though the rollup hasn't reached it yet,
   * so the bar chart shows today's traffic up to the most recent insert.
   */
  async usage(
    req: Request & { user: AuthUser },
    orgId: string,
    days: number,
  ): Promise<ApiKeyUsageResponse> {
    await this.ensureAdmin(req.user.id, orgId);
    const clampedDays = Math.max(1, Math.min(days, 90));
    const from = new Date(Date.now() - clampedDays * 24 * 60 * 60 * 1000);
    const to = new Date();
    const points = await this.usageRepo.dailyForRange(orgId, from, to);
    const dto: ApiKeyUsageDailyDTO[] = points.map((p) => ({
      date: p.date,
      endpoint: p.endpoint,
      requestCount: p.requestCount,
      errorCount: p.errorCount,
      p95ResponseMs: p.p95ResponseMs,
    }));
    return { data: dto };
  }

  private async ensureAdmin(userId: string, orgId: string): Promise<void> {
    const ok = await this.membershipRepo.hasRole(userId, orgId, ADMIN_ROLES);
    if (ok) return;
    if (await isPlatformAdmin(this.userRepo, userId)) return;
    throw new ForbiddenException('Insufficient permissions in this organisation');
  }

  private mapToDTO(row: OrganisationApiKey): ApiKeyDTO {
    return {
      id: row.id,
      organisationId: row.organisation_id,
      name: row.name,
      keyPrefix: row.key_prefix,
      scopes: row.scopes,
      redirectUris: row.redirect_uris ?? [],
      isPublicClient: row.is_public_client,
      lastUsedAt: toIso(row.last_used_at),
      revokedAt: toIso(row.revoked_at),
      expiresAt: toIso(row.expires_at),
      createdByUserId: row.created_by_user_id,
      createdAt: toIsoOrNow(row.created_at),
    };
  }
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function toIsoOrNow(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value) return new Date(String(value)).toISOString();
  return new Date().toISOString();
}
