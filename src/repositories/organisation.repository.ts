import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewOrganisation, Organisation, OrganisationUpdate } from 'src/database/interfaces';

@Injectable()
export class OrganisationRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<Organisation | undefined> {
    return this.db.selectFrom('organisations').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findBySlug(slug: string): Promise<Organisation | undefined> {
    return this.db.selectFrom('organisations').where('slug', '=', slug).selectAll().executeTakeFirst();
  }

  async findByMemberUserId(userId: string): Promise<Organisation[]> {
    return this.db
      .selectFrom('organisations as o')
      .innerJoin('organisation_memberships as m', 'm.organisation_id', 'o.id')
      .where('m.user_id', '=', userId)
      .selectAll('o')
      .orderBy('o.created_at', 'asc')
      .execute();
  }

  /**
   * Used by the org-switcher when the caller has the system-level
   * UserRole.ADMIN — they can drop into any org for support / inspection.
   * Regular users still flow through `findByMemberUserId`.
   */
  async findAll(): Promise<Organisation[]> {
    return this.db
      .selectFrom('organisations')
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();
  }

  async create(data: NewOrganisation): Promise<Organisation> {
    return this.db.insertInto('organisations').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: OrganisationUpdate): Promise<Organisation> {
    return this.db
      .updateTable('organisations')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('organisations').where('id', '=', id).execute();
  }
}
