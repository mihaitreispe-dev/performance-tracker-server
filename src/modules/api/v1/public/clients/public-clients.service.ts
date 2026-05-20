import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Kysely } from 'kysely';

import {
  ClientType,
  Database,
  MembershipMetadata,
  OrganisationMembership,
  OrganisationRole,
  User,
  UserRole,
} from 'src/database/interfaces';
import { ClientProvisioningService } from 'src/modules/api/v1/organisations/client-profiles/client-provisioning.service';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { CreatePublicClientBody, ListPublicClientsQuery } from './request.dto';
import {
  PublicClientDTO,
  PublicClientListResponse,
  PublicClientResponse,
} from './response.dto';

/**
 * Provisioning surface for organisations to onboard their athletes via API.
 *
 * Design choices worth knowing about:
 *
 *   - Idempotent by email. The integrating app rarely tracks our internal user_id —
 *     it calls POST /clients with whatever email it has and expects the same row back
 *     on repeat. We upsert the user by email and ensure the membership exists.
 *
 *   - "Pending" auth state. Real users sign in via Firebase, which mints a uid. Until
 *     a client claims their account through the (future Phase 3) hosted auth flow,
 *     we mint a placeholder firebase_uid (`pending:<uuid>`) and tag `provider='pending'`
 *     so the row is unmistakable and won't accidentally satisfy a Firebase lookup.
 *
 *   - Metadata merge. POST /clients accepts a metadata patch and merges it shallowly
 *     into the existing membership row. The integrating app uses this for external
 *     IDs (CRM id, app user id, etc.) without us having to model first-class columns.
 *
 *   - Tenant strict. Every read filters on req.apiKey.organisationId; clients in
 *     another org are invisible even by direct id.
 */
@Injectable()
export class PublicClientsService {
  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly userRepo: UserRepository,
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly provisioningService: ClientProvisioningService,
  ) {}

  async upsert(organisationId: string, body: CreatePublicClientBody): Promise<PublicClientResponse> {
    const email = body.email.trim().toLowerCase();
    const displayName = body.displayName?.trim() || email.split('@')[0];
    const incomingMetadata = (body.metadata ?? {}) as MembershipMetadata;
    // Default new clients to 'general' (lighter touch) — the integrating app
    // explicitly opts into the 'athlete' track when they want one-to-one
    // coaching. clientType is ignored on subsequent upserts; the per-type
    // default profile is only applied on the first membership create.
    const clientType: ClientType = body.clientType ?? ClientType.GENERAL;

    // Run the user + membership upserts in a single transaction so a partial
    // failure (user created but membership write blows up) can't leave an orphan.
    // `wasCreated` flags whether the membership row was just inserted so we can
    // apply the per-client-type module defaults exactly once (after commit so
    // any partial failure during defaults application doesn't roll the
    // membership back).
    const { user, membership, wasCreated } = await this.db.transaction().execute(async (trx) => {
      const existingUser = await trx
        .selectFrom('users')
        .where('email', '=', email)
        .selectAll()
        .executeTakeFirst();

      let user: User;
      if (existingUser) {
        user = existingUser as User;
      } else {
        // Mint a placeholder so we satisfy the NOT NULL on firebase_uid until the
        // client claims their account via the hosted auth flow.
        const pendingUid = `pending:${randomUUID()}`;
        user = (await trx
          .insertInto('users')
          .values({
            firebase_uid: pendingUid,
            email,
            display_name: displayName,
            provider: 'pending',
            roles: [UserRole.USER],
          })
          .returningAll()
          .executeTakeFirstOrThrow()) as User;
      }

      const existingMembership = await trx
        .selectFrom('organisation_memberships')
        .where('user_id', '=', user.id)
        .where('organisation_id', '=', organisationId)
        .selectAll()
        .executeTakeFirst();

      let membership: OrganisationMembership;
      let wasCreated = false;
      if (existingMembership) {
        const mergedMetadata: MembershipMetadata = {
          ...((existingMembership.metadata as MembershipMetadata) ?? {}),
          ...incomingMetadata,
        };
        membership = await trx
          .updateTable('organisation_memberships')
          .set({
            metadata: mergedMetadata,
            // If the row was somehow still un-accepted, treat the API-create as an
            // implicit acceptance (the integrating app is acting on the user's behalf).
            accepted_at: existingMembership.accepted_at ?? (sql`now()` as never),
            updated_at: sql`now()` as never,
          })
          .where('id', '=', existingMembership.id)
          .returningAll()
          .executeTakeFirstOrThrow();
      } else {
        membership = await trx
          .insertInto('organisation_memberships')
          .values({
            organisation_id: organisationId,
            user_id: user.id,
            role: OrganisationRole.ATHLETE,
            // CHECK constraint enforces client_type IS NOT NULL when role=athlete.
            client_type: clientType,
            invited_by_user_id: null,
            invitation_message: null,
            metadata: incomingMetadata,
            accepted_at: sql`now()` as never,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        wasCreated = true;
      }

      return { user, membership, wasCreated };
    });

    if (wasCreated) {
      // Fire-and-forget: ClientProvisioningService swallows its own errors and
      // logs, so a defaults-application failure can't 500 the caller's request.
      await this.provisioningService.applyClientTypeDefaults({
        organisationId,
        athleteUserId: user.id,
        clientType,
      });
    }

    return { data: mapClientDTO(user, membership) };
  }

  async list(
    organisationId: string,
    query: ListPublicClientsQuery,
  ): Promise<PublicClientListResponse> {
    const metadataMatch = parseMetadataFilter(query);
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;

    const { rows: memberships, totalCount } = await this.membershipRepo.listByOrgWithRole({
      organisationId,
      role: OrganisationRole.ATHLETE,
      metadataMatch,
      offset,
      limit,
    });

    if (memberships.length === 0) {
      return { data: [], meta: { totalCount, offset, limit } };
    }

    const users = await this.userRepo.findByIds(memberships.map((m) => m.user_id));
    const byId = new Map(users.map((u) => [u.id, u]));
    const data = memberships
      .map((m) => {
        const user = byId.get(m.user_id);
        return user ? mapClientDTO(user, m) : null;
      })
      .filter((x): x is PublicClientDTO => x !== null);

    return { data, meta: { totalCount, offset, limit } };
  }

  async getById(organisationId: string, userId: string): Promise<PublicClientResponse> {
    const membership = await this.membershipRepo.findByUserAndOrg(userId, organisationId);
    if (!membership || membership.role !== OrganisationRole.ATHLETE) {
      throw new NotFoundException('Client not found in this organisation');
    }
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('Client not found');
    }
    return { data: mapClientDTO(user, membership) };
  }
}

/**
 * Extracts the optional metadata filter from query params. Public API consumers
 * pass `?metadata.crmId=abc123` or repeat the parameter for multiple filters; we
 * fold those into a `{crmId: "abc123"}` JSONB-containment match.
 *
 * NOTE: only equality is supported (intentionally — keeps the @> query plan trivial
 * and discourages exposing the full Postgres JSONB query surface as a public API).
 */
function parseMetadataFilter(query: ListPublicClientsQuery): Record<string, unknown> | undefined {
  if (!query.metadata) return undefined;
  // Support either a flat object (passed via swagger / structured client) or a
  // string in `key=value` shape (passed via query params).
  if (typeof query.metadata === 'object') return query.metadata as Record<string, unknown>;
  const pairs = String(query.metadata)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out: Record<string, unknown> = {};
  for (const p of pairs) {
    const eq = p.indexOf('=');
    if (eq <= 0) continue;
    out[p.slice(0, eq)] = p.slice(eq + 1);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function mapClientDTO(user: User, membership: OrganisationMembership): PublicClientDTO {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    metadata: (membership.metadata ?? {}) as Record<string, unknown>,
    pendingClaim: user.provider === 'pending',
    createdAt: isoOf(user.created_at),
    membership: {
      id: membership.id,
      role: membership.role,
      clientType: membership.client_type,
      acceptedAt: membership.accepted_at ? isoOf(membership.accepted_at) : null,
    },
  };
}

function isoOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}
