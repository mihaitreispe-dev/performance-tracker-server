import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Observable, from, lastValueFrom } from 'rxjs';
import { Database } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AppConfigService } from 'src/modules/config/app-config.service';

import { KYSELY_ROOT } from '../database.module';
import { OrgContextService } from './org-context.service';

/**
 * Activates the RLS backstop for authenticated tenant requests.
 *
 * For every HTTP request that carries a JWT `org` claim (i.e. a ReHabit /
 * public-OAuth session — see AuthUser.organisationId), this opens a single
 * Kysely transaction, sets `app.bypass_rls='off'` + `app.current_org=<orgId>`
 * on its connection (SET LOCAL via set_config's is_local=true, so it resets at
 * commit/rollback), and runs the whole handler inside that transaction via
 * OrgContextService. Every repository call in the handler then routes onto that
 * connection (through the request-scoped Kysely proxy) and the database enforces
 * `organisation_id = <orgId>`.
 *
 * It is a pure pass-through when:
 *   - RLS_ENABLED is off (the default),
 *   - the request is not HTTP, or
 *   - there is no org claim (org-agnostic tokens: org-app sessions that select
 *     their org via header, platform-admin, impersonation). Those keep relying
 *     on the existing repo scoping + ActiveOrgGuard, and on the policies'
 *     bypass-by-default behaviour.
 */
@Injectable()
export class RlsInterceptor implements NestInterceptor {
  constructor(
    private readonly config: AppConfigService,
    @Inject(KYSELY_ROOT) private readonly root: Kysely<Database>,
    private readonly orgContext: OrgContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.config.rlsEnabled || context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const orgId = request.user?.organisationId;
    if (!orgId) {
      return next.handle();
    }

    return from(
      this.root.transaction().execute(async (trx) => {
        await sql`select set_config('app.bypass_rls', 'off', true)`.execute(trx);
        await sql`select set_config('app.current_org', ${orgId}, true)`.execute(trx);
        return this.orgContext.run({ trx }, () => lastValueFrom(next.handle()));
      }),
    );
  }
}
