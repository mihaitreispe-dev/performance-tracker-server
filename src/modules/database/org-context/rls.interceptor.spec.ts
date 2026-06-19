import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Kysely } from 'kysely';
import { lastValueFrom, of } from 'rxjs';
import { AppConfigService } from 'src/modules/config/app-config.service';

import { Database } from 'src/database/interfaces';
import { OrgContextService } from './org-context.service';
import { RlsInterceptor } from './rls.interceptor';

/**
 * Covers the safety-critical guarantee: the interceptor is a pure pass-through
 * (never opens a transaction, never changes behaviour) unless RLS is enabled
 * AND the request is an HTTP request carrying a JWT org claim. The enforce path
 * (transaction + GUC + ALS) is proven end-to-end by the Postgres integration
 * check, which exercises real set_config/RLS semantics a mock can't.
 */
describe('RlsInterceptor', () => {
  // A root whose transaction() must NOT be touched on any pass-through path.
  const root = { transaction: jest.fn() } as unknown as Kysely<Database>;
  const orgContext = { run: jest.fn() } as unknown as OrgContextService;

  beforeEach(() => jest.clearAllMocks());

  function context(user: { organisationId?: string } | undefined, type = 'http'): ExecutionContext {
    return {
      getType: () => type,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  function handler(value: string): CallHandler {
    return { handle: jest.fn(() => of(value)) };
  }

  function make(rlsEnabled: boolean): RlsInterceptor {
    return new RlsInterceptor({ rlsEnabled } as AppConfigService, root, orgContext);
  }

  it('passes through untouched when RLS is disabled', async () => {
    const interceptor = make(false);
    const next = handler('disabled');

    const out = await lastValueFrom(interceptor.intercept(context({ organisationId: 'o1' }), next));

    expect(out).toBe('disabled');
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(root.transaction).not.toHaveBeenCalled();
  });

  it('passes through when the request carries no org claim', async () => {
    const interceptor = make(true);
    const next = handler('no-claim');

    const out = await lastValueFrom(interceptor.intercept(context({}), next));

    expect(out).toBe('no-claim');
    expect(root.transaction).not.toHaveBeenCalled();
  });

  it('passes through for non-http contexts', async () => {
    const interceptor = make(true);
    const next = handler('rpc');

    const out = await lastValueFrom(interceptor.intercept(context({ organisationId: 'o1' }, 'rpc'), next));

    expect(out).toBe('rpc');
    expect(root.transaction).not.toHaveBeenCalled();
  });
});
