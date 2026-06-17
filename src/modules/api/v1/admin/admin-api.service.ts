import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { Kysely, sql, type SqlBool } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, Organisation, OrganisationRole, User, UserRole } from 'src/database/interfaces';
import { type ApiKeyBand, generateApiKey, hashApiKey } from 'src/modules/auth/api-key/api-key.util';
import { AuthService } from 'src/modules/auth/services/auth.service';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { S3Service } from 'src/modules/s3/s3.service';
import { OrganisationApiKeyRepository } from 'src/repositories/organisation-api-key.repository';
import { OrganisationApiUsageRepository } from 'src/repositories/organisation-api-usage.repository';
import { OrganisationRepository } from 'src/repositories/organisation.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { OrganisationThemeRepository } from 'src/repositories/organisation-theme.repository';
import { ModuleRepository } from 'src/repositories/module.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { BadRequestException } from '@nestjs/common';
import { OrganisationType } from 'src/database/interfaces';
import { OnboardOrganisationBody } from './request.dto';
import { AdminOnboardResponse } from './response.dto';

import { authUserFromUser } from '../auth/auth-user.mapper';
import { AuthSessionResponse } from '../auth/response.dto';
import {
  AdminActivityResponse,
  AdminApiKeyDTO,
  AdminApiKeyListResponse,
  AdminApiUsageResponse,
  AdminIssuedApiKeyResponse,
  AdminModuleStateDTO,
  AdminOrganisationDTO,
  AdminOrganisationDetailResponse,
  AdminOrganisationListResponse,
  AdminOverviewResponse,
  AdminUsageEndpointDTO,
  AdminUserDTO,
  AdminUserListResponse,
} from './response.dto';
import { OrganisationApiKey } from 'src/database/interfaces';

/** Coerce a count/sum aggregate (Kysely returns string|bigint) to a number. */
function num(v: unknown): number {
  return Number(v ?? 0);
}

function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : new Date(v as string).toISOString();
}

/** The latest of the given timestamps as ISO, or null if all are empty. */
function maxIso(...vals: unknown[]): string | null {
  const times = vals.filter(Boolean).map((v) => new Date(v as string).getTime());
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

@Injectable()
export class AdminApiService {
  private readonly logger = new Logger(AdminApiService.name);

  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly userRepo: UserRepository,
    private readonly orgRepo: OrganisationRepository,
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly apiKeyRepo: OrganisationApiKeyRepository,
    private readonly apiUsageRepo: OrganisationApiUsageRepository,
    private readonly moduleRepo: ModuleRepository,
    private readonly themeRepo: OrganisationThemeRepository,
    private readonly authService: AuthService,
    private readonly s3Service: S3Service,
  ) {}

  // ---- Onboarding ----------------------------------------------------------

  /**
   * Create an org with preconfigured settings in one flow: enabled modules,
   * theme/branding, flags, an optional OWNER (existing user, resolved up
   * front so we never half-create), and an optional first API key
   * (cleartext returned once). Reuses the org/module/theme/membership repos
   * + the same key issuance as the standalone endpoint.
   */
  async onboardOrganisation(actorUserId: string, body: OnboardOrganisationBody): Promise<AdminOnboardResponse> {
    if (await this.orgRepo.findBySlug(body.slug)) {
      throw new BadRequestException('Slug already in use.');
    }
    let owner: User | undefined;
    if (body.ownerEmail) {
      owner = await this.userRepo.findByEmail(body.ownerEmail);
      if (!owner) {
        throw new BadRequestException('No user with that email — they must create an account first.');
      }
    }

    const org = await this.orgRepo.create({
      name: body.name,
      slug: body.slug,
      created_by_user_id: actorUserId,
      ...(body.orgType ? { org_type: body.orgType as OrganisationType } : {}),
      ...(body.allowsSelfSignup != null ? { allows_self_signup: body.allowsSelfSignup } : {}),
      ...(body.usesExternalApp != null ? { uses_external_app: body.usesExternalApp } : {}),
    });

    for (const m of body.modules ?? []) {
      await this.moduleRepo.upsertOrgSetting({ organisation_id: org.id, module_key: m.key, enabled: m.enabled });
    }

    if (body.theme) {
      await this.themeRepo.upsert({
        organisation_id: org.id,
        ...(body.theme.themeTokens ? { theme_tokens: body.theme.themeTokens } : {}),
        ...(body.theme.themeTokensDark ? { theme_tokens_dark: body.theme.themeTokensDark } : {}),
        ...(body.theme.copyOverrides ? { copy_overrides: body.theme.copyOverrides } : {}),
        font_family: body.theme.fontFamily ?? null,
      });
    }

    if (owner) {
      await this.membershipRepo.create({
        organisation_id: org.id,
        user_id: owner.id,
        role: OrganisationRole.OWNER,
        client_type: null,
        invited_by_user_id: actorUserId,
        invitation_message: null,
        accepted_at: new Date(),
      });
    }

    let cleartext: string | null = null;
    if (body.apiKey) {
      const issued = await this.issueApiKey(org.id, actorUserId, body.apiKey);
      cleartext = issued.data.key;
    }

    const detail = await this.getOrganisationDetail(org.id);
    return { data: { organisation: detail.data, apiKey: cleartext } };
  }

  /**
   * Every org in the platform, annotated with the caller's own membership
   * role (when present) so the client switcher can highlight "you're in
   * this one" vs "you're dropping in as admin". Member counts come from a
   * single grouped query (see countMembersByOrgs) to keep this O(1) round-
   * trips regardless of org count.
   */
  async listAllOrganisations(req: Request & { user: AuthUser }): Promise<AdminOrganisationListResponse> {
    const orgs = await this.orgRepo.findAll();
    const orgIds = orgs.map((o) => o.id);
    const [counts, callerMemberships] = await Promise.all([
      this.membershipRepo.countMembersByOrgs(orgIds),
      this.membershipRepo.listByUser(req.user.id),
    ]);
    const myRoleByOrg = new Map(callerMemberships.map((m) => [m.organisation_id, m.role]));

    const data: AdminOrganisationDTO[] = await Promise.all(
      orgs.map(async (o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        logoUrl: await this.signLogo(o),
        myRole: myRoleByOrg.get(o.id) ?? null,
        memberCount: counts.get(o.id) ?? 0,
        createdAt: o.created_at instanceof Date ? o.created_at.toISOString() : String(o.created_at),
      })),
    );
    return { data };
  }

  /** Substring search across every user, for the impersonation picker. */
  async listUsers(query: string | undefined): Promise<AdminUserListResponse> {
    const users = await this.userRepo.findManyForAdmin(query);
    return { data: await Promise.all(users.map((u) => this.mapUserToDTO(u))) };
  }

  /**
   * Mint access + refresh tokens for `targetUserId` carrying an `imp` claim
   * pointing at the admin caller. From the client's perspective these are
   * regular session tokens — the caller swaps their stored tokens for these
   * and gains the target user's view of the platform. Logs at info level so
   * audit grep ("impersonating <id>") is one rg away.
   *
   * Guard rails:
   *   - Refuses to impersonate yourself (no-op, hides the banner without
   *     warning).
   *   - Refuses to impersonate another platform admin (privilege escalation
   *     loop / accidental destructive actions while masquerading).
   */
  async impersonate(
    req: Request & { user: AuthUser },
    targetUserId: string,
  ): Promise<AuthSessionResponse> {
    if (req.user.id === targetUserId) {
      throw new ForbiddenException('You are already this user.');
    }
    const target = await this.userRepo.findById(targetUserId);
    if (!target) {
      throw new NotFoundException('User not found');
    }
    const targetRoles = await this.userRepo.findRolesByUserId(targetUserId);
    if (targetRoles.includes(UserRole.ADMIN)) {
      // Treat platform admins as un-impersonatable. Avoids
      // admin-impersonating-admin chains and the surprise of a banner that
      // grants every privilege your own session already has.
      throw new ForbiddenException('Cannot impersonate another platform admin.');
    }

    const tokens = this.authService.generateTokens(targetUserId, {
      impersonatorId: req.user.id,
    });
    this.logger.log(`admin ${req.user.id} impersonating ${targetUserId}`);
    return {
      data: { ...tokens, user: authUserFromUser(target) },
    };
  }

  /** Top-line platform totals for the admin dashboard. */
  async getOverview(): Promise<AdminOverviewResponse> {
    const now = Date.now();
    const d7 = new Date(now - 7 * 86_400_000);
    const d30 = new Date(now - 30 * 86_400_000);

    const [orgs, users, active7, active30, coaches, athletes, workouts, snacks, api] = await Promise.all([
      this.db.selectFrom('organisations').select((eb) => eb.fn.countAll<string>().as('c')).executeTakeFirst(),
      this.db.selectFrom('users').select((eb) => eb.fn.countAll<string>().as('c')).executeTakeFirst(),
      this.db.selectFrom('users').select((eb) => eb.fn.countAll<string>().as('c')).where('last_sign_in_at', '>=', d7).executeTakeFirst(),
      this.db.selectFrom('users').select((eb) => eb.fn.countAll<string>().as('c')).where('last_sign_in_at', '>=', d30).executeTakeFirst(),
      this.db.selectFrom('organisation_memberships').select((eb) => eb.fn.count<string>('user_id').distinct().as('c')).where('role', '=', OrganisationRole.COACH).executeTakeFirst(),
      this.db.selectFrom('organisation_memberships').select((eb) => eb.fn.count<string>('user_id').distinct().as('c')).where('role', '=', OrganisationRole.ATHLETE).executeTakeFirst(),
      this.db.selectFrom('workout_executions').select((eb) => eb.fn.countAll<string>().as('c')).where('completed_at', 'is not', null).where('completed_at', '>=', d30).executeTakeFirst(),
      this.db.selectFrom('snack_completions').select((eb) => eb.fn.countAll<string>().as('c')).where(sql<SqlBool>`completed_at >= ${d30.toISOString()}`).executeTakeFirst(),
      this.db.selectFrom('organisation_api_usage_daily').select((eb) => eb.fn.sum<string>('request_count').as('s')).where('date', '>=', d30).executeTakeFirst(),
    ]);

    return {
      data: {
        organisations: num(orgs?.c),
        users: num(users?.c),
        activeUsers7d: num(active7?.c),
        activeUsers30d: num(active30?.c),
        coaches: num(coaches?.c),
        athletes: num(athletes?.c),
        workouts30d: num(workouts?.c),
        snacks30d: num(snacks?.c),
        apiRequests30d: num(api?.s),
      },
    };
  }

  /** Full detail for one org — roster by role, module state, key count, last activity. */
  async getOrganisationDetail(id: string): Promise<AdminOrganisationDetailResponse> {
    const org = await this.orgRepo.findById(id);
    if (!org) throw new NotFoundException('Organisation not found');

    const memberIds = (
      await this.db.selectFrom('organisation_memberships').select('user_id').where('organisation_id', '=', id).execute()
    ).map((r) => r.user_id);

    const [roleRows, registry, settings, apiKeys, lastSnack, lastWorkout] = await Promise.all([
      this.db
        .selectFrom('organisation_memberships')
        .select('role')
        .select((eb) => eb.fn.countAll<string>().as('c'))
        .where('organisation_id', '=', id)
        .groupBy('role')
        .execute(),
      this.db.selectFrom('modules').select(['key', 'name', 'default_enabled']).orderBy('sort_order').execute(),
      this.db.selectFrom('organisation_module_settings').select(['module_key', 'enabled']).where('organisation_id', '=', id).execute(),
      this.db.selectFrom('organisation_api_keys').select((eb) => eb.fn.countAll<string>().as('c')).where('organisation_id', '=', id).where('revoked_at', 'is', null).executeTakeFirst(),
      this.db.selectFrom('snack_completions').select((eb) => eb.fn.max('completed_at').as('m')).where('organisation_id', '=', id).executeTakeFirst(),
      memberIds.length
        ? this.db.selectFrom('workout_executions').select((eb) => eb.fn.max('completed_at').as('m')).where('user_id', 'in', memberIds).executeTakeFirst()
        : Promise.resolve(undefined),
    ]);

    const roleCount = (r: OrganisationRole) => num(roleRows.find((x) => x.role === r)?.c);
    const settingMap = new Map(settings.map((s) => [s.module_key, s.enabled]));
    const modules: AdminModuleStateDTO[] = registry.map((m) => ({
      key: m.key,
      name: m.name,
      enabled: settingMap.has(m.key) ? !!settingMap.get(m.key) : m.default_enabled,
    }));
    const owners = roleCount(OrganisationRole.OWNER);
    const admins = roleCount(OrganisationRole.ADMIN);
    const coaches = roleCount(OrganisationRole.COACH);
    const athletes = roleCount(OrganisationRole.ATHLETE);

    return {
      data: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        logoUrl: await this.signLogo(org),
        orgType: String(org.org_type),
        allowsSelfSignup: !!org.allows_self_signup,
        usesExternalApp: !!org.uses_external_app,
        roster: { owners, admins, coaches, athletes, total: owners + admins + coaches + athletes },
        modules,
        activeApiKeys: num(apiKeys?.c),
        lastActiveAt: maxIso(lastSnack?.m, lastWorkout?.m),
        createdAt: toIso(org.created_at),
      },
    };
  }

  /**
   * Daily workout + snack activity for an org over a date range (default
   * last 30 days), plus distinct active members + totals. Workouts are
   * attributed via the org's member user ids; snacks carry the org id.
   */
  async getActivity(id: string, fromStr?: string, toStr?: string): Promise<AdminActivityResponse> {
    const org = await this.orgRepo.findById(id);
    if (!org) throw new NotFoundException('Organisation not found');

    const to = toStr ? new Date(toStr) : new Date();
    const from = fromStr ? new Date(fromStr) : new Date(to.getTime() - 30 * 86_400_000);

    const memberIds = (
      await this.db.selectFrom('organisation_memberships').select('user_id').where('organisation_id', '=', id).execute()
    ).map((r) => r.user_id);

    const day = sql<string>`to_char(date_trunc('day', completed_at), 'YYYY-MM-DD')`;

    const [wRows, sRows, activeW, activeS] = await Promise.all([
      memberIds.length
        ? this.db
            .selectFrom('workout_executions')
            .select((eb) => [day.as('d'), eb.fn.countAll<string>().as('c')])
            .where('user_id', 'in', memberIds)
            .where('completed_at', '>=', from)
            .where('completed_at', '<=', to)
            .groupBy(day)
            .execute()
        : Promise.resolve([] as { d: string; c: string }[]),
      this.db
        .selectFrom('snack_completions')
        .select((eb) => [day.as('d'), eb.fn.countAll<string>().as('c')])
        .where('organisation_id', '=', id)
        .where(sql<SqlBool>`completed_at >= ${from.toISOString()}`)
        .where(sql<SqlBool>`completed_at <= ${to.toISOString()}`)
        .groupBy(day)
        .execute(),
      memberIds.length
        ? this.db.selectFrom('workout_executions').select('user_id').distinct().where('user_id', 'in', memberIds).where('completed_at', '>=', from).where('completed_at', '<=', to).execute()
        : Promise.resolve([] as { user_id: string }[]),
      this.db.selectFrom('snack_completions').select('user_id').distinct().where('organisation_id', '=', id).where(sql<SqlBool>`completed_at >= ${from.toISOString()}`).where(sql<SqlBool>`completed_at <= ${to.toISOString()}`).execute(),
    ]);

    const byDay = new Map<string, { workouts: number; snacks: number }>();
    for (const r of wRows) byDay.set(r.d, { workouts: num(r.c), snacks: 0 });
    for (const r of sRows) {
      const e = byDay.get(r.d) ?? { workouts: 0, snacks: 0 };
      e.snacks = num(r.c);
      byDay.set(r.d, e);
    }
    const series = [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, v]) => ({ date, workouts: v.workouts, snacks: v.snacks }));
    const activeMembers = new Set([...activeW.map((r) => r.user_id), ...activeS.map((r) => r.user_id)]).size;

    return {
      data: {
        series,
        activeMembers,
        totalWorkouts: series.reduce((s, p) => s + p.workouts, 0),
        totalSnacks: series.reduce((s, p) => s + p.snacks, 0),
      },
    };
  }

  /** The module registry (key + name + default-enabled) for the onboarding form. */
  async listModules(): Promise<{ data: AdminModuleStateDTO[] }> {
    const modules = await this.moduleRepo.listModules();
    return { data: modules.map((m) => ({ key: m.key, name: m.name, enabled: m.default_enabled })) };
  }

  // ---- API keys ------------------------------------------------------------

  async listApiKeys(orgId: string): Promise<AdminApiKeyListResponse> {
    await this.requireOrg(orgId);
    const keys = await this.apiKeyRepo.listByOrganisation(orgId);
    return { data: keys.map((k) => this.mapApiKey(k)) };
  }

  /** Mint a key — returns the cleartext once; only the hash is stored. */
  async issueApiKey(
    orgId: string,
    actorUserId: string,
    body: { name: string; band?: ApiKeyBand; scopes?: string[]; redirectUris?: string[]; isPublicClient?: boolean },
  ): Promise<AdminIssuedApiKeyResponse> {
    await this.requireOrg(orgId);
    const { fullKey, prefix } = generateApiKey(body.band ?? 'live');
    const keyHash = await hashApiKey(fullKey);
    const row = await this.apiKeyRepo.create({
      organisation_id: orgId,
      name: body.name,
      key_prefix: prefix,
      key_hash: keyHash,
      scopes: body.scopes ?? [],
      redirect_uris: body.redirectUris ?? [],
      is_public_client: body.isPublicClient ?? false,
      created_by_user_id: actorUserId,
    });
    return { data: { key: fullKey, apiKey: this.mapApiKey(row) } };
  }

  async revokeApiKey(keyId: string): Promise<AdminApiKeyDTO> {
    const existing = await this.apiKeyRepo.findById(keyId);
    if (!existing) throw new NotFoundException('API key not found');
    const revoked = await this.apiKeyRepo.revoke(keyId);
    return this.mapApiKey(revoked);
  }

  /** Daily request/error series + top endpoints for an org over a range. */
  async getApiUsage(orgId: string, fromStr?: string, toStr?: string): Promise<AdminApiUsageResponse> {
    await this.requireOrg(orgId);
    const to = toStr ? new Date(toStr) : new Date();
    const from = fromStr ? new Date(fromStr) : new Date(to.getTime() - 30 * 86_400_000);
    const points = await this.apiUsageRepo.dailyForRange(orgId, from, to);

    const byDay = new Map<string, { requests: number; errors: number }>();
    const byEndpoint = new Map<string, { requests: number; errors: number; p95: number | null }>();
    for (const p of points) {
      const d = byDay.get(p.date) ?? { requests: 0, errors: 0 };
      d.requests += p.requestCount;
      d.errors += p.errorCount;
      byDay.set(p.date, d);

      const e = byEndpoint.get(p.endpoint) ?? { requests: 0, errors: 0, p95: null };
      e.requests += p.requestCount;
      e.errors += p.errorCount;
      e.p95 = e.p95 == null ? p.p95ResponseMs : Math.max(e.p95, p.p95ResponseMs ?? 0);
      byEndpoint.set(p.endpoint, e);
    }
    const series = [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, v]) => ({ date, requests: v.requests, errors: v.errors }));
    const endpoints: AdminUsageEndpointDTO[] = [...byEndpoint.entries()]
      .map(([endpoint, v]) => ({ endpoint, requests: v.requests, errors: v.errors, p95ResponseMs: v.p95 }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 20);

    return {
      data: {
        series,
        endpoints,
        totalRequests: series.reduce((s, p) => s + p.requests, 0),
        totalErrors: series.reduce((s, p) => s + p.errors, 0),
      },
    };
  }

  private mapApiKey(k: OrganisationApiKey): AdminApiKeyDTO {
    return {
      id: k.id,
      name: k.name,
      keyPrefix: k.key_prefix,
      scopes: k.scopes ?? [],
      isPublicClient: !!k.is_public_client,
      lastUsedAt: k.last_used_at ? toIso(k.last_used_at) : null,
      revokedAt: k.revoked_at ? toIso(k.revoked_at) : null,
      expiresAt: k.expires_at ? toIso(k.expires_at) : null,
      createdAt: toIso(k.created_at),
    };
  }

  private async requireOrg(id: string): Promise<void> {
    const org = await this.orgRepo.findById(id);
    if (!org) throw new NotFoundException('Organisation not found');
  }

  private async mapUserToDTO(u: User): Promise<AdminUserDTO> {
    let picture: string | null = null;
    if (u.picture_s3_bucket && u.picture_s3_key) {
      picture = await this.s3Service.getSignedUrlGET({
        bucket: u.picture_s3_bucket,
        key: u.picture_s3_key,
        expires: 3600,
      });
    }
    return {
      id: u.id,
      email: u.email,
      displayName: u.display_name ?? null,
      firstName: u.first_name ?? null,
      lastName: u.last_name ?? null,
      picture,
      roles: u.roles,
      createdAt: u.created_at instanceof Date ? u.created_at.toISOString() : String(u.created_at),
    };
  }

  private async signLogo(o: Organisation): Promise<string | null> {
    if (!o.logo_s3_bucket || !o.logo_s3_key) return null;
    return this.s3Service.getSignedUrlGET({
      bucket: o.logo_s3_bucket,
      key: o.logo_s3_key,
      expires: 3600,
    });
  }
}
