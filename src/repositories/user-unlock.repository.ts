import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewUserUnlock } from 'src/database/interfaces';

type Executor = Kysely<Database>;

/** Earned-cosmetic unlock ledger (per-user-per-org). See migration 1774405200000. */
@Injectable()
export class UserUnlockRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  /** All earned cosmetic ids for a user+org (seasonal / leaderboard rewards). */
  async listCosmeticIdsForUser(userId: string, organisationId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('user_unlocks')
      .select('cosmetic_id')
      .where('user_id', '=', userId)
      .where('organisation_id', '=', organisationId)
      .execute();
    return rows.map((r) => r.cosmetic_id);
  }

  /**
   * Grant a cosmetic, idempotent on (user, org, cosmetic). Returns true only when
   * newly inserted — false means it was already owned (re-run / replay).
   */
  async grantIfNew(data: NewUserUnlock, exec: Executor = this.db): Promise<boolean> {
    const inserted = await exec
      .insertInto('user_unlocks')
      .values(data)
      .onConflict((oc) => oc.columns(['user_id', 'organisation_id', 'cosmetic_id']).doNothing())
      .returning('id')
      .executeTakeFirst();
    return !!inserted;
  }
}
