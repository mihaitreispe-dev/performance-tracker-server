import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';

import { Database, NewOnboardingResponse, OnboardingResponse } from 'src/database/interfaces';

@Injectable()
export class OnboardingResponseRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async create(row: NewOnboardingResponse): Promise<OnboardingResponse> {
    return this.db
      .insertInto('onboarding_responses')
      .values(row)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findById(id: string): Promise<OnboardingResponse | undefined> {
    return this.db
      .selectFrom('onboarding_responses')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();
  }

  /**
   * Latest completed response for (user, org). Drives "generate me a workout from
   * this user's most recent onboarding answers".
   */
  async latestForUserOrg(
    userId: string,
    organisationId: string,
  ): Promise<OnboardingResponse | undefined> {
    return this.db
      .selectFrom('onboarding_responses')
      .where('user_id', '=', userId)
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .orderBy('completed_at', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  async listByUserOrg(
    userId: string,
    organisationId: string,
    opts: { offset?: number; limit?: number } = {},
  ): Promise<OnboardingResponse[]> {
    return this.db
      .selectFrom('onboarding_responses')
      .where('user_id', '=', userId)
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .orderBy('completed_at', 'desc')
      .offset(opts.offset ?? 0)
      .limit(opts.limit ?? 50)
      .execute();
  }
}
