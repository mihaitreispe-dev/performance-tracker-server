import { OrgContextService } from './org-context.service';
import { createRequestScopedKysely } from './request-scoped-kysely';

/**
 * The proxy is the load-bearing trick that lets every `@InjectKysely()` repo
 * transparently pick up the per-request org transaction. These guard that it
 * routes to the right target. (Real RLS enforcement is integration-tested
 * against Postgres; this is the in-process routing contract.)
 */
describe('createRequestScopedKysely', () => {
  it('routes to root when no request transaction is active', () => {
    const root = { selectFrom: jest.fn().mockReturnValue('root-qb') };
    const orgContext = new OrgContextService();

    const proxy = createRequestScopedKysely(root as never, orgContext);

    expect((proxy as unknown as typeof root).selectFrom('workouts')).toBe('root-qb');
    expect(root.selectFrom).toHaveBeenCalledWith('workouts');
  });

  it('routes to the request transaction when a store is active', () => {
    const root = { selectFrom: jest.fn().mockReturnValue('root-qb') };
    const trx = { selectFrom: jest.fn().mockReturnValue('trx-qb') };
    const orgContext = new OrgContextService();

    const proxy = createRequestScopedKysely(root as never, orgContext);

    const result = orgContext.run({ trx: trx as never }, () =>
      (proxy as unknown as typeof root).selectFrom('workouts'),
    );

    expect(result).toBe('trx-qb');
    expect(trx.selectFrom).toHaveBeenCalledWith('workouts');
    expect(root.selectFrom).not.toHaveBeenCalled();
  });

  it('falls back to root again once the store unwinds', () => {
    const root = { selectFrom: jest.fn().mockReturnValue('root-qb') };
    const trx = { selectFrom: jest.fn().mockReturnValue('trx-qb') };
    const orgContext = new OrgContextService();
    const proxy = createRequestScopedKysely(root as never, orgContext) as unknown as typeof root;

    orgContext.run({ trx: trx as never }, () => proxy.selectFrom('a'));
    const after = proxy.selectFrom('b');

    expect(after).toBe('root-qb');
    expect(root.selectFrom).toHaveBeenCalledWith('b');
  });

  it('binds methods to their resolved target so Kysely `this` stays correct', () => {
    const root = {
      _name: 'root',
      whoami(this: { _name: string }) {
        return this._name;
      },
    };
    const orgContext = new OrgContextService();
    const proxy = createRequestScopedKysely(root as never, orgContext) as unknown as typeof root;

    expect(proxy.whoami()).toBe('root');
  });
});
