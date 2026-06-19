import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Kysely, PostgresDialect } from 'kysely';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { Pool } from 'pg';
import { Database } from 'src/database/interfaces';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { AppConfigService } from 'src/modules/config/app-config.service';

import { OrgContextService } from './org-context/org-context.service';
import { createRequestScopedKysely } from './org-context/request-scoped-kysely';

/**
 * Injection token for the ROOT Kysely (a real connection pool, never proxied).
 * Repositories must NOT use this — they inject the request-scoped proxy via
 * `@InjectKysely()`. Only RlsInterceptor uses the root, to open the per-request
 * transaction that the proxy then routes everything onto.
 */
export const KYSELY_ROOT = 'KYSELY_ROOT';

/**
 * Replaces nestjs-kysely's own root module so we can interpose a request-scoped
 * proxy on the default `@InjectKysely()` token (see request-scoped-kysely.ts).
 * The proxy is what makes the RLS org-context plumbing transparent to every
 * repository. Global so the token resolves everywhere, exactly as the original
 * KyselyModule (which is itself @Global) did.
 */
@Module({})
export class DatabaseModule {
  private static rootInstance?: DynamicModule;
  static forRoot(): DynamicModule {
    if (!this.rootInstance) {
      this.rootInstance = {
        module: DatabaseModule,
        global: true,
        imports: [ConfigModule, AppConfigModule.register()],
        providers: [
          OrgContextService,
          {
            provide: KYSELY_ROOT,
            inject: [AppConfigService],
            useFactory: (configService: AppConfigService) =>
              new Kysely<Database>({
                dialect: new PostgresDialect({
                  pool: new Pool({
                    host: configService.dbHost,
                    port: configService.dbPort,
                    user: configService.dbUser,
                    password: configService.dbPassword,
                    database: configService.dbName,
                    ssl: configService.dbSSL ? { rejectUnauthorized: false } : false,
                    // Bumped from 10: with RLS on, each tenant request holds a
                    // connection for its whole handler (the request tx), so the
                    // pool needs more headroom for concurrent in-flight requests.
                    max: 25,
                  }),
                }),
              }),
          },
          {
            // The token `@InjectKysely()` resolves — hand every repo the proxy.
            provide: KYSELY_MODULE_CONNECTION_TOKEN(),
            inject: [KYSELY_ROOT, OrgContextService],
            useFactory: (root: Kysely<Database>, orgContext: OrgContextService) =>
              createRequestScopedKysely(root, orgContext),
          },
        ],
        exports: [OrgContextService, KYSELY_ROOT, KYSELY_MODULE_CONNECTION_TOKEN()],
      };
    }
    return this.rootInstance;
  }
}
