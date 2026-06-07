import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewSnackCompletion, SnackCompletion } from 'src/database/interfaces';

/**
 * Snack-play log access layer. See migration 1774404000000 / the
 * SnackCompletionsTable interface for the row shape and the rationale
 * for allowing duplicate completions per user.
 *
 * Two access patterns are surfaced:
 *
 *   - `create()` — single insert. The rehabit player posts one of
 *     these per autoAdvanceOnEnd-fired completion.
 *   - `listForUser()` — reverse-chronological play history scoped to
 *     one user. Drives the "things you've done lately" view; the
 *     index on (user_id, completed_at DESC) covers this query
 *     without a sort buffer.
 */
@Injectable()
export class SnackCompletionRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async create(data: NewSnackCompletion): Promise<SnackCompletion> {
    return this.db
      .insertInto('snack_completions')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Most-recent-first play log for a single user, capped at `limit`
   * (defaults to a generous 100 — the rehabit history page is a
   * scrollable list, not a paginated grid, and the snack catalogue
   * is small enough that an unbounded scan would be safe too).
   */
  async listForUser(userId: string, opts?: { limit?: number }): Promise<SnackCompletion[]> {
    return this.db
      .selectFrom('snack_completions')
      .where('user_id', '=', userId)
      .selectAll()
      .orderBy('completed_at', 'desc')
      .limit(opts?.limit ?? 100)
      .execute();
  }
}
