import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';

import {
  Database,
  NewOAuthAuthorizationCode,
  OAuthAuthorizationCode,
} from 'src/database/interfaces';

@Injectable()
export class OAuthAuthorizationCodeRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async create(row: NewOAuthAuthorizationCode): Promise<OAuthAuthorizationCode> {
    return this.db
      .insertInto('oauth_authorization_codes')
      .values(row)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Find a non-expired, non-used code by its opaque value. Returns undefined if the
   * code is expired/used/missing — the caller can't tell which, by design (no
   * information leak to attackers probing codes).
   *
   * The returned row carries `code_challenge` + `code_challenge_method` so the
   * service can verify PKCE without a second roundtrip.
   */
  async findRedeemable(code: string): Promise<OAuthAuthorizationCode | undefined> {
    return this.db
      .selectFrom('oauth_authorization_codes')
      .where('code', '=', code)
      .where('used_at', 'is', null)
      .where('expires_at', '>', sql`now()` as never)
      .selectAll()
      .executeTakeFirst();
  }

  /**
   * Compare-and-swap: only flips used_at if it was still NULL, so two concurrent
   * exchanges can't both succeed. Returns true iff this call won the race.
   */
  async markUsed(code: string): Promise<boolean> {
    const result = await sql`
      UPDATE oauth_authorization_codes
      SET used_at = now()
      WHERE code = ${code}
        AND used_at IS NULL
        AND expires_at > now()
    `.execute(this.db);
    return Number(result.numAffectedRows ?? 0) > 0;
  }

  /** Cron-friendly cleanup. Drops codes that expired more than `keepHours` ago. */
  async pruneExpired(keepHours = 24): Promise<number> {
    const result = await sql`
      DELETE FROM oauth_authorization_codes
      WHERE expires_at < now() - make_interval(hours => ${keepHours})
    `.execute(this.db);
    return Number(result.numAffectedRows ?? 0);
  }
}
