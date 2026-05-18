import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  NewOrganisationTheme,
  OrganisationTheme,
  OrganisationThemeUpdate,
} from 'src/database/interfaces';

@Injectable()
export class OrganisationThemeRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findByOrganisationId(organisationId: string): Promise<OrganisationTheme | undefined> {
    return this.db
      .selectFrom('organisation_themes')
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .executeTakeFirst();
  }

  async upsert(data: NewOrganisationTheme): Promise<OrganisationTheme> {
    const existing = await this.findByOrganisationId(data.organisation_id);
    if (existing) {
      return this.db
        .updateTable('organisation_themes')
        .set({ ...data, updated_at: sql`now()` })
        .where('organisation_id', '=', data.organisation_id)
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    return this.db.insertInto('organisation_themes').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async update(organisationId: string, data: OrganisationThemeUpdate): Promise<OrganisationTheme> {
    return this.db
      .updateTable('organisation_themes')
      .set({ ...data, updated_at: sql`now()` })
      .where('organisation_id', '=', organisationId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
