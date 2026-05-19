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
}
