import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Transaction } from 'kysely';
import { Database } from 'src/database/interfaces';

/**
 * Per-request org context carried through async work via AsyncLocalStorage.
 *
 * When an authenticated tenant request is in flight, RlsInterceptor opens one
 * Kysely transaction, sets the org GUC on its connection, and stashes that
 * transaction here. The request-scoped Kysely proxy (see
 * request-scoped-kysely.ts) reads it so every repository transparently runs on
 * that same connection — which is the only one carrying `app.current_org`, and
 * therefore the only one the RLS policies will let through.
 *
 * Absent a store (cron, CLI, seeds, unauthenticated / org-agnostic requests)
 * the proxy falls back to the root connection, where the policies bypass by
 * default — so those paths are entirely unaffected.
 */
export interface OrgContextStore {
  trx: Transaction<Database>;
}

@Injectable()
export class OrgContextService {
  private readonly als = new AsyncLocalStorage<OrgContextStore>();

  run<T>(store: OrgContextStore, callback: () => T): T {
    return this.als.run(store, callback);
  }

  getStore(): OrgContextStore | undefined {
    return this.als.getStore();
  }
}
