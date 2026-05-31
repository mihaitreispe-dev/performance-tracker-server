import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  NewOrganisationMembership,
  OrganisationMembership,
  OrganisationMembershipUpdate,
  OrganisationRole,
} from 'src/database/interfaces';

@Injectable()
export class OrganisationMembershipRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<OrganisationMembership | undefined> {
    return this.db.selectFrom('organisation_memberships').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByUserAndOrg(userId: string, organisationId: string): Promise<OrganisationMembership | undefined> {
    return this.db
      .selectFrom('organisation_memberships')
      .where('user_id', '=', userId)
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .executeTakeFirst();
  }

  async listByOrg(organisationId: string): Promise<OrganisationMembership[]> {
    return this.db
      .selectFrom('organisation_memberships')
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();
  }

  /**
   * Admin path: group counts across many orgs in one round-trip so the admin
   * org list doesn't fan out to N count queries. Returns a Map of orgId →
   * member count; orgs with zero memberships are absent (callers should
   * default to 0).
   */
  async countMembersByOrgs(organisationIds: string[]): Promise<Map<string, number>> {
    if (organisationIds.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('organisation_memberships')
      .where('organisation_id', 'in', organisationIds)
      .select(({ fn }) => ['organisation_id as id', fn.countAll<string>().as('count')])
      .groupBy('organisation_id')
      .execute();
    return new Map(rows.map((r) => [r.id as string, Number(r.count)]));
  }

  async listByUser(userId: string): Promise<OrganisationMembership[]> {
    return this.db
      .selectFrom('organisation_memberships')
      .where('user_id', '=', userId)
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();
  }

  /** Memberships the user has actually accepted (joined). */
  async listAcceptedByUser(userId: string): Promise<OrganisationMembership[]> {
    return this.db
      .selectFrom('organisation_memberships')
      .where('user_id', '=', userId)
      .where('accepted_at', 'is not', null)
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();
  }

  /** Pending invitations the user has received but not yet accepted. */
  async listPendingByUser(userId: string): Promise<OrganisationMembership[]> {
    return this.db
      .selectFrom('organisation_memberships')
      .where('user_id', '=', userId)
      .where('accepted_at', 'is', null)
      .selectAll()
      .orderBy('invited_at', 'desc')
      .execute();
  }

  async create(data: NewOrganisationMembership): Promise<OrganisationMembership> {
    return this.db.insertInto('organisation_memberships').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: OrganisationMembershipUpdate): Promise<OrganisationMembership> {
    return this.db
      .updateTable('organisation_memberships')
      .set(data)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async accept(id: string): Promise<OrganisationMembership> {
    return this.db
      .updateTable('organisation_memberships')
      .set({ accepted_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('organisation_memberships').where('id', '=', id).execute();
  }

  async hasRole(userId: string, organisationId: string, roles: OrganisationRole[]): Promise<boolean> {
    const row = await this.db
      .selectFrom('organisation_memberships')
      .where('user_id', '=', userId)
      .where('organisation_id', '=', organisationId)
      .where('role', 'in', roles)
      .select('id')
      .executeTakeFirst();
    return !!row;
  }

  /**
   * List members of an org filtered by role and an optional metadata equality
   * filter (`metadata @> {...}` semantics, so partial matches against the JSONB
   * column). Used by the public clients listing endpoint.
   */
  async listByOrgWithRole(opts: {
    organisationId: string;
    role: OrganisationRole;
    metadataMatch?: Record<string, unknown>;
    offset?: number;
    limit?: number;
  }): Promise<{ rows: OrganisationMembership[]; totalCount: number }> {
    const { organisationId, role, metadataMatch, offset = 0, limit = 50 } = opts;
    let query = this.db
      .selectFrom('organisation_memberships')
      .where('organisation_id', '=', organisationId)
      .where('role', '=', role);

    if (metadataMatch && Object.keys(metadataMatch).length > 0) {
      // jsonb @> jsonb — partial containment match.
      query = query.where(sql<boolean>`metadata @> ${JSON.stringify(metadataMatch)}::jsonb`);
    }

    const [rows, countRow] = await Promise.all([
      query
        .selectAll()
        .orderBy('created_at', 'desc')
        .offset(offset)
        .limit(limit)
        .execute(),
      query
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .executeTakeFirst(),
    ]);
    return { rows, totalCount: Number(countRow?.count ?? 0) };
  }
}
