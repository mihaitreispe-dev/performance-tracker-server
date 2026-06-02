import { DynamicModule, Global, Module } from '@nestjs/common';
import { OutboundSyncJobRepository } from 'src/repositories/outbound-sync-job.repository';

import { OutboundSyncApiService } from './outbound-sync-api.service';
import { OUTBOUND_SYNC_PROVIDERS } from './outbound-sync-provider.interface';

/**
 * Outbound-sync infrastructure (spec D3).
 *
 * Marked @Global so the WorkoutExecutionsApiService can inject the
 * service without explicit cross-module wiring — every workout
 * completion fires `enqueueForExecution`, so it's effectively
 * shell-wide.
 *
 * Provider implementations (Strava, Apple Health server-side hooks,
 * etc.) get added under OUTBOUND_SYNC_PROVIDERS in follow-up tasks.
 * Today the registry is empty — workflow ships but no jobs get
 * created until at least one provider lands.
 */
@Global()
@Module({})
export class OutboundSyncApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: OutboundSyncApiModule,
        providers: [
          OutboundSyncApiService,
          OutboundSyncJobRepository,
          // Empty provider array — populate as adapters land. Each
          // provider would be registered as its own NestJS provider
          // and included in this array via a multi-provider pattern.
          { provide: OUTBOUND_SYNC_PROVIDERS, useValue: [] },
        ],
        exports: [OutboundSyncApiService],
      };
    }
    return this.instance;
  }
}
