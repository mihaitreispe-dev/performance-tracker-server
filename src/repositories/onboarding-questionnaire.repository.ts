import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';

import {
  Database,
  NewOnboardingQuestionnaire,
  OnboardingQuestionnaire,
  OnboardingQuestionnaireUpdate,
} from 'src/database/interfaces';

@Injectable()
export class OnboardingQuestionnaireRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<OnboardingQuestionnaire | undefined> {
    return this.db
      .selectFrom('onboarding_questionnaires')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();
  }

  async findByIdInOrg(id: string, organisationId: string): Promise<OnboardingQuestionnaire | undefined> {
    return this.db
      .selectFrom('onboarding_questionnaires')
      .where('id', '=', id)
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .executeTakeFirst();
  }

  async listByOrg(
    organisationId: string,
    opts: { publishedOnly?: boolean; offset?: number; limit?: number } = {},
  ): Promise<OnboardingQuestionnaire[]> {
    let query = this.db
      .selectFrom('onboarding_questionnaires')
      .where('organisation_id', '=', organisationId)
      .selectAll();
    if (opts.publishedOnly) {
      query = query.where('is_published', '=', true);
    }
    return query
      .orderBy('created_at', 'desc')
      .offset(opts.offset ?? 0)
      .limit(opts.limit ?? 50)
      .execute();
  }

  async create(row: NewOnboardingQuestionnaire): Promise<OnboardingQuestionnaire> {
    return this.db
      .insertInto('onboarding_questionnaires')
      .values(row)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateById(id: string, patch: OnboardingQuestionnaireUpdate): Promise<OnboardingQuestionnaire> {
    return this.db
      .updateTable('onboarding_questionnaires')
      .set({ ...patch, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('onboarding_questionnaires').where('id', '=', id).execute();
  }
}
