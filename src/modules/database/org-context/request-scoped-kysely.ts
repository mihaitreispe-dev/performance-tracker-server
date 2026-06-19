import { Kysely } from 'kysely';
import { Database } from 'src/database/interfaces';

import { OrgContextService } from './org-context.service';

/**
 * Wraps the root Kysely in a Proxy that transparently redirects every call to
 * the active request transaction when one is set in OrgContextService, and to
 * the root connection otherwise.
 *
 * This is what lets all ~108 `@InjectKysely()` repositories pick up the
 * org-scoped request transaction with zero per-repo changes: they hold this
 * proxy, and `selectFrom` / `insertInto` / `transaction` / etc. resolve against
 * whichever connection is live for the current async context.
 *
 * `Transaction<Database>` extends `Kysely<Database>`, so the API surface is
 * identical. Methods are bound to the resolved target so Kysely's private state
 * (`this`) stays correct.
 */
export function createRequestScopedKysely(
  root: Kysely<Database>,
  orgContext: OrgContextService,
): Kysely<Database> {
  return new Proxy(root, {
    get(target, prop, receiver) {
      const active: Kysely<Database> = orgContext.getStore()?.trx ?? target;
      const value = Reflect.get(active, prop, receiver);
      return typeof value === 'function' ? value.bind(active) : value;
    },
  });
}
